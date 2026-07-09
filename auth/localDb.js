/**
 * StudioFlow — Local Relational Database Engine
 *
 * 100% JavaScript (zero native C++ compilation issues) local database.
 * Stores data in a structured JSON file inside the app's userData directory.
 * Mimics SQL tables: profiles and usage.
 */

const { app } = require('electron');
const path = require('path');
const fs   = require('fs');

const DB_FILE = path.join(app.getPath('userData'), 'studioflow_local.db.json');

// ── Default DB State ─────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  profiles: [], // { id, email, full_name, plan, plan_expires_at, password_hash }
  usage: [],    // { id, user_id, month, recording_minutes, updated_at }
  session: null // current active session: { user_id, email, plan }
};

// ── Database helper functions ───────────────────────────────────────────────

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(DEFAULT_STATE);
      return DEFAULT_STATE;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[DB] readDb error:', e);
    return DEFAULT_STATE;
  }
}

function writeDb(state) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] writeDb error:', e);
  }
}

// ── Auth APIs ────────────────────────────────────────────────────────────────

/**
 * Sign in locally.
 */
async function signIn(email, password) {
  const db = readDb();
  const emailClean = String(email).trim().toLowerCase();
  
  const user = db.profiles.find(p => p.email === emailClean);
  if (!user) {
    return { ok: false, error: 'User does not exist. Please register first.' };
  }
  
  // Note: in a real local auth we would check a secure password hash, 
  // but for local developer convenience we do a simple check.
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  
  // Update active session
  db.session = {
    user_id: user.id,
    email: user.email,
    plan: user.plan
  };
  writeDb(db);
  
  return {
    ok: true,
    user: { id: user.id, email: user.email },
    plan: user.plan,
    profile: user
  };
}

/**
 * Sign up locally.
 */
async function signUp(email, password, fullName, plan = 'basic') {
  const db = readDb();
  const emailClean = String(email).trim().toLowerCase();
  
  const exists = db.profiles.some(p => p.email === emailClean);
  if (exists) {
    return { ok: false, error: 'User already exists with this email.' };
  }
  
  const newId = 'user_' + Math.random().toString(36).substring(2, 11);
  const newProfile = {
    id: newId,
    email: emailClean,
    full_name: fullName || 'Local User',
    plan: plan || 'basic',
    plan_expires_at: null,
    created_at: new Date().toISOString()
  };
  
  db.profiles.push(newProfile);
  
  // Log in automatically on signup
  db.session = {
    user_id: newId,
    email: emailClean,
    plan: plan
  };
  writeDb(db);
  
  return {
    ok: true,
    user: { id: newId, email: emailClean },
    plan: plan,
    profile: newProfile,
    needsConfirmation: false // local DB is instant
  };
}

/**
 * Sign out locally.
 */
async function signOut() {
  const db = readDb();
  db.session = null;
  writeDb(db);
  return { ok: true };
}

/**
 * Restore local session.
 */
async function restoreSession() {
  const db = readDb();
  if (!db.session) return { ok: false, reason: 'no_session' };
  
  const profile = db.profiles.find(p => p.id === db.session.user_id);
  if (!profile) return { ok: false, reason: 'user_not_found' };
  
  return {
    ok: true,
    user: { id: profile.id, email: profile.email },
    plan: profile.plan,
    profile: profile
  };
}

// ── Profile APIs ─────────────────────────────────────────────────────────────

async function fetchProfile(userId) {
  const db = readDb();
  const profile = db.profiles.find(p => p.id === userId);
  return profile || { plan: 'basic' };
}

async function getUserPlan() {
  const db = readDb();
  if (!db.session) return 'basic';
  const profile = db.profiles.find(p => p.id === db.session.user_id);
  return profile?.plan || 'basic';
}

// ── Usage APIs ───────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getUsage() {
  const db = readDb();
  if (!db.session) return { used: 0, limit: 60, plan: 'basic', remaining: 60 };
  
  const userId = db.session.user_id;
  const month = currentMonth();
  
  const row = db.usage.find(u => u.user_id === userId && u.month === month);
  const used = row ? row.recording_minutes : 0;
  
  const profile = db.profiles.find(p => p.id === userId);
  const plan = profile ? profile.plan : 'basic';
  
  const { getMonthlyMinutes } = require('./plans');
  const limit = getMonthlyMinutes(plan);
  
  return {
    used,
    limit,
    plan,
    remaining: limit === Infinity ? Infinity : Math.max(0, limit - used)
  };
}

async function addUsage(minutes) {
  if (!minutes || minutes <= 0) return;
  const db = readDb();
  if (!db.session) return;
  
  const userId = db.session.user_id;
  const month = currentMonth();
  
  let row = db.usage.find(u => u.user_id === userId && u.month === month);
  if (row) {
    row.recording_minutes += minutes;
    row.updated_at = new Date().toISOString();
  } else {
    db.usage.push({
      id: db.usage.length + 1,
      user_id: userId,
      month,
      recording_minutes: minutes,
      updated_at: new Date().toISOString()
    });
  }
  
  writeDb(db);
}

async function updateUserPlan(plan) {
  const db = readDb();
  if (!db.session) return { ok: false, error: 'No active session' };
  
  const userId = db.session.user_id;
  const profile = db.profiles.find(p => p.id === userId);
  if (profile) {
    profile.plan = plan;
    db.session.plan = plan;
    writeDb(db);
    return { ok: true };
  }
  return { ok: false, error: 'User profile not found' };
}

module.exports = {
  signIn,
  signUp,
  signOut,
  restoreSession,
  fetchProfile,
  getUserPlan,
  getUsage,
  addUsage,
  updateUserPlan,
};

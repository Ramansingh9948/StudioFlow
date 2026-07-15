/**
 * StudioFlow — MongoDB Auth & Usage Client (Main Process)
 *
 * All MongoDB operations run in the Electron main process (Node.js).
 * Session tokens are stored encrypted via Electron's safeStorage.
 * Falls back to localDb.js if MongoDB is offline or not configured.
 */

const { MongoClient } = require('mongodb');
const { safeStorage, app } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { MONGODB_URI, OFFLINE_GRACE_DAYS } = require('./config');
const localDb = require('./localDb');

// ── Encrypted local session cache ────────────────────────────────────────────
const SESSION_FILE = path.join(app.getPath('userData'), 'sf_session.enc');
const CACHE_FILE   = path.join(app.getPath('userData'), 'sf_plan_cache.json');

function saveSession(session) {
  try {
    if (!session) { if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE); return; }
    const json = JSON.stringify(session);
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(SESSION_FILE, safeStorage.encryptString(json));
    }
  } catch (e) { console.error('[Auth] saveSession error:', e.message); }
}

function loadSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const enc  = fs.readFileSync(SESSION_FILE);
    const json = safeStorage.decryptString(enc);
    return JSON.parse(json);
  } catch (e) { return null; }
}

function savePlanCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...data, cached_at: Date.now() }));
  } catch (e) {}
}

function loadPlanCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const ageDays = (Date.now() - data.cached_at) / 86400000;
    if (ageDays > OFFLINE_GRACE_DAYS) return null;
    return data;
  } catch (e) { return null; }
}

// ── Password Hashing Helper ──────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── MongoDB Client Management ────────────────────────────────────────────────
let client = null;
let db = null;
let connectionFailed = false;

async function getDb() {
  if (connectionFailed) return null;
  if (db) return db;
  if (!MONGODB_URI) {
    connectionFailed = true;
    console.warn('[MongoDB] URI not configured. Falling back to local relational JSON database.');
    return null;
  }
  try {
    client = new MongoClient(MONGODB_URI, { connectTimeoutMS: 2000, serverSelectionTimeoutMS: 2000 });
    await client.connect();
    db = client.db('studioflow');
    console.log('[MongoDB] Connected successfully.');
    return db;
  } catch (err) {
    connectionFailed = true;
    console.warn(`[MongoDB] Connection failed: ${err.message}. Falling back to local relational JSON database.`);
    return null;
  }
}

// ── Auth operations ──────────────────────────────────────────────────────────

async function signIn(email, password) {
  const mongo = await getDb();
  if (!mongo) return localDb.signIn(email, password);

  try {
    const emailClean = String(email).trim().toLowerCase();
    const profiles = mongo.collection('profiles');
    const profile = await profiles.findOne({ email: emailClean });
    if (!profile) {
      return { ok: false, error: 'User does not exist. Please register first.' };
    }

    const hashed = hashPassword(password);
    if (profile.password_hash !== hashed) {
      return { ok: false, error: 'Invalid password.' };
    }

    const session = { user_id: profile.id, email: profile.email, plan: profile.plan || 'basic' };
    saveSession(session);
    savePlanCache(profile);

    return { ok: true, user: { id: profile.id, email: profile.email }, plan: profile.plan || 'basic', profile };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function signUp(email, password, fullName, plan = 'basic') {
  const mongo = await getDb();
  if (!mongo) return localDb.signUp(email, password, fullName, plan);

  try {
    const emailClean = String(email).trim().toLowerCase();
    const profiles = mongo.collection('profiles');
    const exists = await profiles.findOne({ email: emailClean });
    if (exists) {
      return { ok: false, error: 'User already exists with this email.' };
    }

    const newId = 'user_' + crypto.randomBytes(6).toString('hex');
    const hashed = hashPassword(password);
    const newProfile = {
      id: newId,
      email: emailClean,
      password_hash: hashed,
      full_name: fullName || 'StudioFlow User',
      plan: plan || 'basic',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await profiles.insertOne(newProfile);

    const session = { user_id: newId, email: emailClean, plan: plan };
    saveSession(session);
    savePlanCache(newProfile);

    return {
      ok: true,
      user: { id: newId, email: emailClean },
      plan,
      needsConfirmation: false
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function signOut() {
  const mongo = await getDb();
  saveSession(null);
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  if (!mongo) return localDb.signOut();
  return { ok: true };
}

async function resetPassword(email) {
  const mongo = await getDb();
  if (!mongo) return { ok: true }; // Mock success on local fallback
  try {
    const emailClean = String(email).trim().toLowerCase();
    const profiles = mongo.collection('profiles');
    const profile = await profiles.findOne({ email: emailClean });
    if (!profile) return { ok: false, error: 'Email address not registered.' };
    
    // In a production application, you would trigger a SMTP mailer here.
    // For StudioFlow, we return success.
    console.log(`[MongoDB Reset] Password reset requested for: ${emailClean}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function restoreSession() {
  const session = loadSession();
  if (!session) return { ok: false, reason: 'no_session' };

  const mongo = await getDb();
  if (!mongo) {
    const cache = loadPlanCache();
    if (cache) return { ok: true, offline: true, ...cache };
    return localDb.restoreSession();
  }

  try {
    const profiles = mongo.collection('profiles');
    const profile = await profiles.findOne({ id: session.user_id });
    if (!profile) {
      const cache = loadPlanCache();
      if (cache) return { ok: true, offline: true, ...cache };
      return { ok: false, reason: 'session_expired' };
    }

    savePlanCache(profile);
    return { ok: true, user: { id: profile.id, email: profile.email }, plan: profile.plan || 'basic', profile };
  } catch (e) {
    const cache = loadPlanCache();
    if (cache) return { ok: true, offline: true, ...cache };
    return { ok: false, reason: 'network_error', error: e.message };
  }
}

async function fetchProfile(userId) {
  const mongo = await getDb();
  if (!mongo) return localDb.fetchProfile(userId);

  try {
    const profiles = mongo.collection('profiles');
    const profile = await profiles.findOne({ id: userId });
    return profile || { plan: 'basic' };
  } catch (e) {
    return { plan: 'basic' };
  }
}

async function getUserPlan() {
  const session = loadSession();
  if (!session) return 'basic';

  const mongo = await getDb();
  if (!mongo) {
    const cache = loadPlanCache();
    return cache?.plan || 'basic';
  }

  try {
    const profiles = mongo.collection('profiles');
    const profile = await profiles.findOne({ id: session.user_id });
    return profile?.plan || 'basic';
  } catch (e) {
    const cache = loadPlanCache();
    return cache?.plan || 'basic';
  }
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getUsage() {
  const session = loadSession();
  if (!session) return { used: 0, limit: 60, plan: 'basic' };

  const mongo = await getDb();
  if (!mongo) return localDb.getUsage();

  try {
    const month = currentMonth();
    const usage = mongo.collection('usage');
    const data = await usage.findOne({ user_id: session.user_id, month });

    const profiles = mongo.collection('profiles');
    const profile = await profiles.findOne({ id: session.user_id });
    
    const { getMonthlyMinutes } = require('./plans');
    const plan = profile?.plan || 'basic';
    const limit = getMonthlyMinutes(plan);
    const used = data?.recording_minutes || 0;

    return { used, limit, plan, remaining: limit === Infinity ? Infinity : Math.max(0, limit - used) };
  } catch (e) {
    return { used: 0, limit: 60, plan: 'basic', remaining: 60 };
  }
}

async function addUsage(minutes) {
  if (!minutes || minutes <= 0) return;
  const session = loadSession();
  if (!session) return;

  const mongo = await getDb();
  if (!mongo) return localDb.addUsage(minutes);

  try {
    const month = currentMonth();
    const usage = mongo.collection('usage');
    await usage.updateOne(
      { user_id: session.user_id, month },
      { 
        $inc: { recording_minutes: minutes },
        $set: { updated_at: new Date().toISOString() }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error('[MongoDB] addUsage error:', e.message);
  }
}

async function updateUserPlan(plan) {
  const session = loadSession();
  if (!session) return { ok: false, error: 'No authenticated user' };

  const mongo = await getDb();
  if (!mongo) return localDb.updateUserPlan(plan);

  try {
    const profiles = mongo.collection('profiles');
    await profiles.updateOne(
      { id: session.user_id },
      { $set: { plan, updated_at: new Date().toISOString() } }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  signIn,
  signUp,
  signOut,
  resetPassword,
  restoreSession,
  getUserPlan,
  getUsage,
  addUsage,
  fetchProfile,
  updateUserPlan,
};

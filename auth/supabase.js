/**
 * StudioFlow — Supabase Auth & Usage Client (Main Process)
 *
 * All Supabase operations run in the Electron main process (Node.js).
 * Session tokens are stored encrypted via Electron's safeStorage.
 */

const { createClient } = require('@supabase/supabase-js');
const { safeStorage, app }  = require('electron');
const path = require('path');
const fs   = require('fs');
const ws   = require('ws');

// Polyfill global WebSocket for Supabase Realtime in Electron Node environment
if (typeof global !== 'undefined' && !global.WebSocket) {
  global.WebSocket = ws;
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, OFFLINE_GRACE_DAYS } = require('./config');

// ── Supabase client configuration & verification ──────────────────────────────

let supabase = null;

function isConfigured() {
  return SUPABASE_URL && !SUPABASE_URL.includes('YOUR_PROJECT_ID') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY_HERE');
}

function getClient() {
  if (!supabase) {
    if (!isConfigured()) {
      throw new Error('Supabase is not configured. Running in Local Developer Mode fallback.');
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // We handle persistence ourselves via safeStorage
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        websocket: ws,
      },
    });
  }
  return supabase;
}

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
    if (ageDays > OFFLINE_GRACE_DAYS) return null; // cache expired
    return data;
  } catch (e) { return null; }
}

// ── Auth operations ──────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 * Returns { ok, user, plan, error }
 */
async function signIn(email, password) {
  if (!isConfigured()) {
    console.log('[Auth] Sign in called in Local Developer Mode');
    const devUser = { id: 'dev-user-id', email: email || 'developer@studioflow.local' };
    const devProfile = { id: 'dev-user-id', email: email || 'developer@studioflow.local', full_name: 'Developer Account', plan: 'max' };
    savePlanCache(devProfile);
    return { ok: true, user: devUser, plan: 'max', profile: devProfile };
  }

  try {
    const db = getClient();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    saveSession(data.session);
    await db.auth.setSession(data.session);

    const profile = await fetchProfile(data.user.id);
    savePlanCache(profile);

    return { ok: true, user: data.user, plan: profile.plan || 'basic', profile };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Register with email + password + plan choice.
 * Returns { ok, user, plan, error }
 */
async function signUp(email, password, fullName, plan = 'basic') {
  if (!isConfigured()) {
    console.log(`[Auth] Sign up called in Local Developer Mode for plan: ${plan}`);
    const devUser = { id: 'dev-user-id', email: email || 'developer@studioflow.local' };
    const devProfile = { id: 'dev-user-id', email: email || 'developer@studioflow.local', full_name: fullName || 'Developer Account', plan: plan || 'max' };
    savePlanCache(devProfile);
    return { ok: true, user: devUser, plan: plan || 'max', profile: devProfile };
  }

  try {
    const db = getClient();
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { ok: false, error: error.message };

    // Create profile row (trigger in DB also does this, but belt & suspenders)
    if (data.user) {
      await db.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        plan,
      });
    }

    if (data.session) {
      saveSession(data.session);
      await db.auth.setSession(data.session);
    }

    return {
      ok: true,
      user: data.user,
      plan,
      needsConfirmation: !data.session, // email confirmation required
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Sign out — clears session and cache.
 */
async function signOut() {
  if (!isConfigured()) {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    return { ok: true };
  }

  try {
    const db = getClient();
    await db.auth.signOut();
    saveSession(null);
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Send password reset email.
 */
async function resetPassword(email) {
  if (!isConfigured()) {
    return { ok: true };
  }

  try {
    const db = getClient();
    const { error } = await db.auth.resetPasswordForEmail(email);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Restore session from encrypted local storage (called on app start).
 * Returns { ok, user, plan, profile } or { ok: false }
 */
async function restoreSession() {
  if (!isConfigured()) {
    const cache = loadPlanCache();
    if (cache) {
      console.log('[Auth] Local Developer Mode: session restored');
      return { ok: true, user: { id: 'dev-user-id', email: cache.email }, plan: cache.plan || 'max', profile: cache };
    }
    return { ok: false, reason: 'no_session' };
  }

  try {
    const session = loadSession();
    if (!session) return { ok: false, reason: 'no_session' };

    const db = getClient();
    const { data, error } = await db.auth.setSession(session);
    if (error || !data.session) {
      // Session expired — try offline cache
      const cache = loadPlanCache();
      if (cache) return { ok: true, offline: true, ...cache };
      return { ok: false, reason: 'session_expired' };
    }

    saveSession(data.session); // refresh stored session
    const profile = await fetchProfile(data.user.id);
    savePlanCache(profile);

    return { ok: true, user: data.user, plan: profile.plan || 'basic', profile };
  } catch (e) {
    // Network error — try offline cache
    const cache = loadPlanCache();
    if (cache) return { ok: true, offline: true, ...cache };
    return { ok: false, reason: 'network_error', error: e.message };
  }
}

// ── Profile & plan ────────────────────────────────────────────────────────────

async function fetchProfile(userId) {
  if (!isConfigured()) {
    const cache = loadPlanCache();
    return cache || { plan: 'max', email: 'developer@studioflow.local', full_name: 'Developer Account' };
  }

  try {
    const db = getClient();
    const { data } = await db.from('profiles').select('*').eq('id', userId).single();
    return data || { plan: 'basic' };
  } catch (e) {
    return { plan: 'basic' };
  }
}

/**
 * Get current user's plan — from Supabase or offline cache.
 */
async function getUserPlan() {
  if (!isConfigured()) {
    const cache = loadPlanCache();
    return cache?.plan || 'max';
  }

  try {
    const db = getClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return 'basic';
    const profile = await fetchProfile(user.id);
    return profile.plan || 'basic';
  } catch (e) {
    const cache = loadPlanCache();
    return cache?.plan || 'basic';
  }
}

// ── Usage tracking ───────────────────────────────────────────────────────────

/**
 * Returns current month key e.g. '2026-07'
 */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get recording minutes used this month for the current user.
 * Returns { used, limit, plan }
 */
async function getUsage() {
  if (!isConfigured()) {
    const cache = loadPlanCache();
    const plan = cache?.plan || 'max';
    const { getMonthlyMinutes } = require('./plans');
    const limit = getMonthlyMinutes(plan);
    return { used: 0, limit, plan, remaining: limit };
  }

  try {
    const db = getClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { used: 0, limit: 60, plan: 'basic' };

    const month = currentMonth();
    const { data } = await db
      .from('usage')
      .select('recording_minutes')
      .eq('user_id', user.id)
      .eq('month', month)
      .single();

    const profile = await fetchProfile(user.id);
    const { getMonthlyMinutes } = require('./plans');
    const plan  = profile.plan || 'basic';
    const limit = getMonthlyMinutes(plan);
    const used  = data?.recording_minutes || 0;

    return { used, limit, plan, remaining: limit === Infinity ? Infinity : Math.max(0, limit - used) };
  } catch (e) {
    return { used: 0, limit: 60, plan: 'basic', remaining: 60 };
  }
}

/**
 * Add recorded minutes to this month's usage counter.
 * @param {number} minutes - whole number of minutes recorded
 */
async function addUsage(minutes) {
  if (!minutes || minutes <= 0) return;
  if (!isConfigured()) {
    console.log(`[Auth] addUsage mock called: +${minutes} minutes`);
    return;
  }

  try {
    const db = getClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const month = currentMonth();
    // Upsert: create or increment
    const { data: existing } = await db
      .from('usage')
      .select('id, recording_minutes')
      .eq('user_id', user.id)
      .eq('month', month)
      .single();

    if (existing) {
      await db
        .from('usage')
        .update({ recording_minutes: existing.recording_minutes + minutes, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await db
        .from('usage')
        .insert({ user_id: user.id, month, recording_minutes: minutes });
    }
  } catch (e) {
    console.error('[Auth] addUsage error:', e.message);
  }
}

async function updateUserPlan(plan) {
  try {
    if (!isConfigured()) {
      const cache = loadPlanCache();
      if (cache) {
        cache.plan = plan;
        savePlanCache(cache);
      }
      return { ok: true };
    }

    const db = getClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { ok: false, error: 'No authenticated user' };

    const { error } = await db.from('profiles').update({ plan }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  getClient,
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

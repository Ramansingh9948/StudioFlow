/**
 * StudioFlow — Supabase Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create a free account
 * 2. Create a new project (choose a region close to your users)
 * 3. Go to Project Settings → API
 * 4. Copy your "Project URL" and "anon / public" key below
 * 5. Run the SQL schema in supabase_schema.sql in the Supabase SQL Editor
 *
 * DO NOT commit real keys to git — use environment variables in production.
 */

module.exports = {
  SUPABASE_URL: 'https://itsmzngulkgvlblbkpsd.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable__5S1Bu-oVDJsY0XktL3KZg_WdXvyF6f',

  // App settings
  APP_NAME: 'StudioFlow',
  SUPPORT_EMAIL: 'support@studioflow.app',

  // Pricing page URL (for upgrade CTA in app)
  PRICING_URL: 'https://studioflow.app/pricing',

  // Offline grace period: days before forcing re-auth when offline
  OFFLINE_GRACE_DAYS: 7,
};

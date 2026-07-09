# StudioFlow Auth + Subscriptions — Tasks

## Phase 1: Setup
- [x] Implementation plan approved
- [x] Install @supabase/supabase-js
- [x] Create auth/ directory structure
- [x] Create auth/config.js (Supabase credentials placeholder)
- [x] Create auth/plans.js (plan definitions + feature gates)
- [x] Create auth/supabase.js (client + all auth functions)

## Phase 2: Auth Screen
- [x] Create renderer/auth.html (premium login/register/plan-select UI)

## Phase 3: Main Process
- [x] Modify main.js (auth window logic, IPC handlers, session management)

## Phase 4: Preload
- [x] Modify preload.js (expose window.SF.auth.* and window.SF.plan.*)

## Phase 5: Main App Feature Gates
- [x] Add plan badge + recording quota bar to index.html titlebar
- [x] Gate Storytelling tab (Educator+ only)
- [x] Gate iPad Sync (Educator+ only)
- [x] Gate YouTube Live (School+ only)
- [x] Gate PDF Export (Educator+ only)
- [x] Gate Loom float mode (Educator+ only)
- [x] Recording start: check quota before starting
- [x] Recording stop: track minutes to Supabase
- [x] Upgrade modal for locked features
- [x] Logout button in Settings

## Phase 6: Verification
- [x] Boot → auth screen appears
- [x] Login → main app loads
- [x] Free plan gates enforced correctly
- [x] Quota check works

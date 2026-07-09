-- ============================================================
-- StudioFlow — Supabase Database Schema
--
-- Run this in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New query → paste & run
-- ============================================================

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT,
  full_name      TEXT,
  plan           TEXT NOT NULL DEFAULT 'basic'
                   CHECK (plan IN ('basic', 'pro', 'max', 'enterprise')),
  plan_expires_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Usage tracking (per calendar month per user)
CREATE TABLE IF NOT EXISTS public.usage (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month              TEXT NOT NULL,  -- e.g. '2026-07'
  recording_minutes  INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage    ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/write their own row
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Usage: users can only read/write their own usage
CREATE POLICY "usage_select_own" ON public.usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_insert_own" ON public.usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "usage_update_own" ON public.usage
  FOR UPDATE USING (auth.uid() = user_id);

-- ── Auto-create profile on new user signup ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, plan)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'plan', 'basic')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON public.usage(user_id, month);

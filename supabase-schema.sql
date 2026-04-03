-- ═══════════════════════════════════════════
-- Uncle Carter Pipeline — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════

-- Step 1: Create the stories table
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Story content
  title TEXT NOT NULL,
  players TEXT,
  era TEXT,
  archetype TEXT,
  category TEXT,
  obscurity INT DEFAULT 3,
  angle TEXT,
  hook TEXT,
  statline TEXT,
  
  -- Pipeline status
  status TEXT DEFAULT 'accepted' CHECK (status IN ('accepted','approved','scripted','produced','published','rejected','archived')),
  scheduled_date DATE,
  
  -- Scripts (multi-language)
  script TEXT,
  script_version INT DEFAULT 0,
  script_fr TEXT,
  script_es TEXT,
  script_pt TEXT,
  
  -- Production metadata
  hook_style TEXT,
  pacing TEXT,
  music_mood TEXT,
  visual_style TEXT,
  duration TEXT,
  post_time TEXT,
  
  -- Performance metrics
  metrics_views TEXT,
  metrics_completion TEXT,
  metrics_watch_time TEXT,
  metrics_likes TEXT,
  metrics_comments TEXT,
  metrics_saves TEXT,
  metrics_shares TEXT,
  metrics_follows TEXT,
  
  -- Notes
  notes TEXT,
  
  -- AI Scoring
  ai_score INT,
  ai_score_emotional INT,
  ai_score_obscurity INT,
  ai_score_visual INT,
  ai_score_hook INT,
  ai_score_note TEXT,
  
  -- A/B Testing
  ab_test BOOLEAN DEFAULT false,
  ab_variable TEXT,
  ab_variable_label TEXT,
  ab_variant_a TEXT,
  ab_variant_b TEXT,
  ab_platform_a TEXT,
  ab_platform_b TEXT,
  ab_winner TEXT,
  ab_metrics_a_views TEXT,
  ab_metrics_a_completion TEXT,
  ab_metrics_a_saves TEXT,
  ab_metrics_a_shares TEXT,
  ab_metrics_b_views TEXT,
  ab_metrics_b_completion TEXT,
  ab_metrics_b_saves TEXT,
  ab_metrics_b_shares TEXT
);

-- Step 2: Enable Row Level Security
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Step 3: Allow authenticated users to do everything
-- This means only logged-in users can access data.
-- Unauthenticated requests (no valid token) get nothing.
CREATE POLICY "Authenticated users full access"
  ON stories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Step 4: Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories (status);
CREATE INDEX IF NOT EXISTS idx_stories_scheduled ON stories (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_stories_created ON stories (created_at DESC);

-- ═══════════════════════════════════════════
-- GOOGLE AUTH SETUP (do this in Supabase Dashboard, not SQL):
--
-- 1. Go to Authentication → Providers → Google
-- 2. Enable Google provider
-- 3. Add your Google OAuth credentials:
--    - Go to https://console.cloud.google.com
--    - Create a project (or use existing)
--    - Go to APIs & Services → Credentials
--    - Create OAuth 2.0 Client ID
--    - Application type: Web application
--    - Authorized redirect URI: https://YOUR-PROJECT.supabase.co/auth/v1/callback
--    - Copy Client ID and Client Secret into Supabase
-- 4. In Supabase Auth settings, set:
--    - Site URL: https://your-deployed-app.vercel.app (or http://localhost:3000 for dev)
--    - Redirect URLs: http://localhost:3000, https://your-deployed-app.vercel.app
-- ═══════════════════════════════════════════

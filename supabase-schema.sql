-- ═══════════════════════════════════════════
-- Uncle Carter Pipeline — Complete Supabase Schema
-- Run this in Supabase SQL Editor. Safe to rerun.
-- ═══════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════
-- STORIES
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  title TEXT NOT NULL,
  players TEXT,
  era TEXT,
  archetype TEXT,
  category TEXT,
  obscurity INT DEFAULT 3,
  angle TEXT,
  hook TEXT,
  statline TEXT,
  status TEXT DEFAULT 'accepted',
  scheduled_date DATE,
  script TEXT,
  script_version INT DEFAULT 0,
  script_fr TEXT,
  script_es TEXT,
  script_pt TEXT,
  hook_style TEXT,
  pacing TEXT,
  music_mood TEXT,
  visual_style TEXT,
  duration TEXT,
  post_time TEXT,
  metrics_views TEXT,
  metrics_completion TEXT,
  metrics_watch_time TEXT,
  metrics_likes TEXT,
  metrics_comments TEXT,
  metrics_saves TEXT,
  metrics_shares TEXT,
  metrics_follows TEXT,
  notes TEXT,
  ai_score INT,
  ai_score_emotional INT,
  ai_score_obscurity INT,
  ai_score_visual INT,
  ai_score_hook INT,
  ai_score_note TEXT,
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

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS workspace_id UUID,
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID,
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS hook_type TEXT,
  ADD COLUMN IF NOT EXISTS emotional_angle TEXT,
  ADD COLUMN IF NOT EXISTS reach_score INT,
  ADD COLUMN IF NOT EXISTS predicted_score INT,
  ADD COLUMN IF NOT EXISTS score_total INT,
  ADD COLUMN IF NOT EXISTS score_emotional INT,
  ADD COLUMN IF NOT EXISTS score_obscurity INT,
  ADD COLUMN IF NOT EXISTS score_visual INT,
  ADD COLUMN IF NOT EXISTS score_hook INT,
  ADD COLUMN IF NOT EXISTS pt_review_cleared BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS subject_tags TEXT[],
  ADD COLUMN IF NOT EXISTS platform_target TEXT,
  ADD COLUMN IF NOT EXISTS production_status TEXT,
  ADD COLUMN IF NOT EXISTS visual_brief JSONB,
  ADD COLUMN IF NOT EXISTS visual_refs JSONB,
  ADD COLUMN IF NOT EXISTS audio_refs JSONB,
  ADD COLUMN IF NOT EXISTS assembly_brief JSONB,
  ADD COLUMN IF NOT EXISTS quality_gate JSONB,
  ADD COLUMN IF NOT EXISTS quality_gate_status TEXT,
  ADD COLUMN IF NOT EXISTS quality_gate_blockers INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_gate_warnings INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_gate_checked_at TIMESTAMPTZ;

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON stories;
CREATE POLICY "Authenticated users full access"
  ON stories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stories_status ON stories (status);
CREATE INDEX IF NOT EXISTS idx_stories_scheduled ON stories (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_stories_created ON stories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_brand ON stories (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_stories_quality_gate ON stories (quality_gate_status);

-- ═══════════════════════════════════════════
-- BRAND PROFILES
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  name TEXT NOT NULL,
  brief_doc TEXT,
  settings JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access brand profiles" ON brand_profiles;
CREATE POLICY "Authenticated users full access brand profiles"
  ON brand_profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  story_id UUID,
  story_title TEXT,
  details TEXT
);

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS performed_by TEXT;
ALTER TABLE audit_log ALTER COLUMN user_email DROP NOT NULL;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read audit" ON audit_log;
CREATE POLICY "Authenticated read audit"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Authenticated insert audit" ON audit_log;
CREATE POLICY "Authenticated insert audit"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_story ON audit_log (story_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);

-- ═══════════════════════════════════════════
-- AI CALL COST / HEALTH LOG
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  type TEXT NOT NULL,
  provider_name TEXT,
  model_version TEXT,
  tokens_input INT,
  tokens_output INT,
  cost_estimate NUMERIC DEFAULT 0,
  story_id UUID,
  brand_profile_id UUID,
  workspace_id UUID,
  user_email TEXT,
  success BOOLEAN DEFAULT true,
  duration_ms INT,
  error_type TEXT,
  error_message TEXT
);

ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read ai calls" ON ai_calls;
CREATE POLICY "Authenticated read ai calls"
  ON ai_calls FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Authenticated insert ai calls" ON ai_calls;
CREATE POLICY "Authenticated insert ai calls"
  ON ai_calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_story ON ai_calls (story_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_brand ON ai_calls (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_type ON ai_calls (type);

-- ═══════════════════════════════════════════
-- PROVIDER SECRETS
-- Accessed by server-side API routes through the service role.
-- No authenticated read/write policy is added on purpose.
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS provider_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  brand_profile_id UUID,
  provider_type TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  secrets JSONB DEFAULT '{}'::jsonb,
  config JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true,
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_error TEXT
);

ALTER TABLE provider_secrets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_provider_secrets_brand_type ON provider_secrets (brand_profile_id, provider_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_secrets_active_unique
  ON provider_secrets (brand_profile_id, provider_type)
  WHERE active = true;

-- ═══════════════════════════════════════════
-- STORY DOCUMENTS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS story_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  brand_profile_id UUID,
  workspace_id UUID,
  story_id UUID,
  document_type TEXT NOT NULL,
  file_name TEXT,
  storage_ref TEXT,
  content_summary TEXT
);

ALTER TABLE story_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access story documents" ON story_documents;
CREATE POLICY "Authenticated users full access story documents"
  ON story_documents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_story_documents_story ON story_documents (story_id);
CREATE INDEX IF NOT EXISTS idx_story_documents_brand ON story_documents (brand_profile_id);

-- ═══════════════════════════════════════════
-- ASSET LIBRARY
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS asset_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  brand_profile_id UUID,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  language TEXT,
  format_scope TEXT[] DEFAULT ARRAY[]::TEXT[],
  era_scope TEXT[] DEFAULT ARRAY[]::TEXT[],
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  position_intent TEXT[] DEFAULT ARRAY[]::TEXT[],
  source TEXT,
  created_by_agent BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  reuse_count INT DEFAULT 0
);

ALTER TABLE asset_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access asset library" ON asset_library;
CREATE POLICY "Authenticated users full access asset library"
  ON asset_library FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_asset_library_brand ON asset_library (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_asset_library_active ON asset_library (active);
CREATE INDEX IF NOT EXISTS idx_asset_library_type ON asset_library (type);

-- ═══════════════════════════════════════════
-- VISUAL ASSETS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS visual_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  story_id UUID,
  brand_profile_id UUID,
  workspace_id UUID,
  source TEXT,
  asset_type TEXT,
  file_url TEXT,
  thumbnail_url TEXT,
  width INT,
  height INT,
  prompt TEXT,
  brief_snapshot JSONB,
  format TEXT,
  position_intent TEXT,
  was_selected BOOLEAN DEFAULT false,
  selection_order INT,
  provider_cost NUMERIC DEFAULT 0,
  generated_by TEXT,
  rank_score INT,
  rank_reasoning TEXT
);

ALTER TABLE visual_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access visual assets" ON visual_assets;
CREATE POLICY "Authenticated users full access visual assets"
  ON visual_assets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_visual_assets_story ON visual_assets (story_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_brand ON visual_assets (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_selected ON visual_assets (was_selected);

-- ═══════════════════════════════════════════
-- AGENT FEEDBACK
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  agent_name TEXT NOT NULL,
  brand_profile_id UUID,
  workspace_id UUID,
  story_id UUID,
  ai_call_id UUID,
  correction_type TEXT,
  agent_output JSONB,
  user_correction JSONB,
  notes TEXT,
  agent_confidence NUMERIC,
  was_auto_approved BOOLEAN DEFAULT false
);

ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access agent feedback" ON agent_feedback;
CREATE POLICY "Authenticated users full access agent feedback"
  ON agent_feedback FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_agent ON agent_feedback (agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_story ON agent_feedback (story_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_brand ON agent_feedback (brand_profile_id);

-- ═══════════════════════════════════════════
-- GOOGLE AUTH SETUP (Dashboard, not SQL):
--
-- Authentication → Providers → Google
-- Authorized redirect URI:
-- https://YOUR-PROJECT.supabase.co/auth/v1/callback
-- Add your localhost and deployed URLs to Auth → URL Configuration.
-- ═══════════════════════════════════════════

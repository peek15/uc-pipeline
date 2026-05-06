-- ═══════════════════════════════════════════
-- AUDIT LOG TABLE — Add this to your Supabase SQL Editor
-- Run AFTER the main schema
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  user_email TEXT NOT NULL,
  user_name TEXT,
  action TEXT NOT NULL,  -- 'created', 'approved', 'rejected', 'scripted', 'scheduled', 'deleted', 'metrics_logged'
  story_id UUID,
  story_title TEXT,
  details TEXT           -- Additional context e.g. "status: accepted → approved"
);

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

-- ═══════════════════════════════════════════
-- AI CALL COST / HEALTH LOG
-- Used by src/lib/ai/audit.js and Analyze → AI Usage.
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

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

CREATE POLICY "Authenticated read audit"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert audit"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_story ON audit_log (story_id);

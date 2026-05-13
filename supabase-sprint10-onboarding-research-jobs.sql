-- Commercial Hardening: Onboarding research jobs
-- Adds retryable/recoverable source research job records for smart onboarding.

CREATE TABLE IF NOT EXISTS onboarding_research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('company_research','website_research','document_ocr','document_extraction')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','retrying','partial','completed','failed','cancelled')),
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_research_jobs_workspace
  ON onboarding_research_jobs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_research_jobs_session
  ON onboarding_research_jobs (session_id, status, created_at DESC);

ALTER TABLE onboarding_research_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read onboarding research jobs" ON onboarding_research_jobs;
CREATE POLICY "workspace members can read onboarding research jobs"
ON onboarding_research_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = onboarding_research_jobs.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can create onboarding research jobs" ON onboarding_research_jobs;
CREATE POLICY "workspace members can create onboarding research jobs"
ON onboarding_research_jobs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = onboarding_research_jobs.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can update onboarding research jobs" ON onboarding_research_jobs;
CREATE POLICY "workspace members can update onboarding research jobs"
ON onboarding_research_jobs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = onboarding_research_jobs.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = onboarding_research_jobs.workspace_id
      AND wm.user_id = auth.uid()
  )
);

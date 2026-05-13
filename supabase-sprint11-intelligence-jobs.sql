-- Commercial Hardening: Intelligence job system
-- Generic workspace-scoped queue for durable intelligence work.

CREATE TABLE IF NOT EXISTS intelligence_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  brand_profile_id UUID NULL,
  session_id UUID NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'onboarding_research',
    'document_extraction',
    'ocr_extraction',
    'gateway_eval',
    'provider_task',
    'generic'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',
    'running',
    'retrying',
    'completed',
    'failed',
    'cancelled'
  )),
  priority INTEGER NOT NULL DEFAULT 5,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_jobs_workspace_status
  ON intelligence_jobs (workspace_id, status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_intelligence_jobs_brand
  ON intelligence_jobs (brand_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intelligence_jobs_session
  ON intelligence_jobs (session_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intelligence_jobs_type
  ON intelligence_jobs (job_type, status, created_at DESC);

ALTER TABLE intelligence_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read intelligence jobs" ON intelligence_jobs;
CREATE POLICY "workspace members can read intelligence jobs"
ON intelligence_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = intelligence_jobs.workspace_id
      AND (wm.user_id = auth.uid() OR wm.email = auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "workspace members can create intelligence jobs" ON intelligence_jobs;
CREATE POLICY "workspace members can create intelligence jobs"
ON intelligence_jobs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = intelligence_jobs.workspace_id
      AND (wm.user_id = auth.uid() OR wm.email = auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "workspace members can update intelligence jobs" ON intelligence_jobs;
CREATE POLICY "workspace members can update intelligence jobs"
ON intelligence_jobs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = intelligence_jobs.workspace_id
      AND (wm.user_id = auth.uid() OR wm.email = auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = intelligence_jobs.workspace_id
      AND (wm.user_id = auth.uid() OR wm.email = auth.jwt() ->> 'email')
  )
);


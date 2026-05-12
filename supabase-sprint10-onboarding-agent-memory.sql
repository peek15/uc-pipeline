-- Commercial Hardening: Onboarding agent memory
-- Persists conversation turns, tool traces, and agent state snapshots for
-- full-screen onboarding recovery and reviewable work.

CREATE TABLE IF NOT EXISTS onboarding_agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('user_message','assistant_message','tool_calls','agent_state','source_trace','system')),
  role TEXT NOT NULL DEFAULT 'system'
    CHECK (role IN ('user','assistant','tool','system')),
  content TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_agent_memory_session
  ON onboarding_agent_memory (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_onboarding_agent_memory_workspace
  ON onboarding_agent_memory (workspace_id, created_at DESC);

ALTER TABLE onboarding_agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read onboarding agent memory" ON onboarding_agent_memory;
CREATE POLICY "Workspace members read onboarding agent memory"
  ON onboarding_agent_memory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = onboarding_agent_memory.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace members write onboarding agent memory" ON onboarding_agent_memory;
CREATE POLICY "Workspace members write onboarding agent memory"
  ON onboarding_agent_memory FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = onboarding_agent_memory.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace members update onboarding agent memory" ON onboarding_agent_memory;
CREATE POLICY "Workspace members update onboarding agent memory"
  ON onboarding_agent_memory FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = onboarding_agent_memory.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = onboarding_agent_memory.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

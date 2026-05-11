-- ══════════════════════════════════════════════════════════════════════
-- Commercial Hardening Sprint 6 — Smart Onboarding V1
--
-- Adds source-first onboarding sessions, extracted facts,
-- clarification questions, drafts, and approval tracking.
-- Safe to rerun (IF NOT EXISTS / DROP POLICY IF EXISTS guards).
-- ══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Role helper for owner/admin checks ───────────────────────────────
CREATE OR REPLACE FUNCTION is_workspace_admin(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_uuid
      AND wm.role IN ('owner', 'admin')
      AND (
        wm.user_id = auth.uid()
        OR lower(wm.email) = lower(auth.email())
      )
  );
$$;

-- ── Sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','collecting_sources','analyzing_sources','needs_clarification','draft_ready','approved','skipped','archived')),
  mode TEXT NOT NULL DEFAULT 'workspace_setup'
    CHECK (mode IN ('workspace_setup','brand_setup','strategy_refresh')),
  created_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_workspace
  ON onboarding_sessions (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_brand
  ON onboarding_sessions (brand_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status
  ON onboarding_sessions (status);

-- ── Sources ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('website','pdf','image','markdown','text_note','social_page','uploaded_asset','manual_answer')),
  url TEXT,
  file_ref TEXT,
  filename TEXT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','analyzed','failed','skipped')),
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sources_session
  ON onboarding_sources (session_id, created_at);

-- ── Extracted facts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_extracted_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value JSONB,
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low','medium','high')),
  source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted_by_user BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_facts_session
  ON onboarding_extracted_facts (session_id, field_key);

-- ── Clarifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('single_choice','multi_choice','free_text','choice_plus_other','confirmation')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','answered','skipped')),
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_clarifications_session
  ON onboarding_clarifications (session_id, status);

-- ── Drafts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL
    CHECK (draft_type IN ('brand_profile','content_strategy','programmes','recommendations','risk_checklist','first_content_ideas')),
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','rejected','superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_drafts_session
  ON onboarding_drafts (session_id, draft_type, status);

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_extracted_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read onboarding sessions" ON onboarding_sessions;
CREATE POLICY "Workspace members read onboarding sessions"
  ON onboarding_sessions FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members create onboarding sessions" ON onboarding_sessions;
CREATE POLICY "Workspace members create onboarding sessions"
  ON onboarding_sessions FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members update onboarding sessions" ON onboarding_sessions;
CREATE POLICY "Workspace members update onboarding sessions"
  ON onboarding_sessions FOR UPDATE
  TO authenticated
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members read onboarding sources" ON onboarding_sources;
CREATE POLICY "Workspace members read onboarding sources"
  ON onboarding_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_sources.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members write onboarding sources" ON onboarding_sources;
CREATE POLICY "Workspace members write onboarding sources"
  ON onboarding_sources FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_sources.session_id
        AND is_workspace_member(s.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_sources.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members read onboarding facts" ON onboarding_extracted_facts;
CREATE POLICY "Workspace members read onboarding facts"
  ON onboarding_extracted_facts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_extracted_facts.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members write onboarding facts" ON onboarding_extracted_facts;
CREATE POLICY "Workspace members write onboarding facts"
  ON onboarding_extracted_facts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_extracted_facts.session_id
        AND is_workspace_member(s.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_extracted_facts.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members read onboarding clarifications" ON onboarding_clarifications;
CREATE POLICY "Workspace members read onboarding clarifications"
  ON onboarding_clarifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_clarifications.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members write onboarding clarifications" ON onboarding_clarifications;
CREATE POLICY "Workspace members write onboarding clarifications"
  ON onboarding_clarifications FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_clarifications.session_id
        AND is_workspace_member(s.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_clarifications.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members read onboarding drafts" ON onboarding_drafts;
CREATE POLICY "Workspace members read onboarding drafts"
  ON onboarding_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_drafts.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members write onboarding drafts" ON onboarding_drafts;
CREATE POLICY "Workspace members write onboarding drafts"
  ON onboarding_drafts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_drafts.session_id
        AND is_workspace_member(s.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM onboarding_sessions s
      WHERE s.id = onboarding_drafts.session_id
        AND is_workspace_member(s.workspace_id)
    )
  );

-- Service role bypasses RLS in Supabase and is used by the server routes
-- for analysis/draft processing and approval writes.

-- Sprint 11B: Studio Data Model
-- Tables: content_versions, studio_blocks, edit_requests
-- Apply with: Supabase SQL editor or MCP execute_sql

-- ── content_versions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_versions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id             UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  workspace_id         UUID NOT NULL,
  brand_profile_id     UUID,
  version_number       INTEGER NOT NULL DEFAULT 1,
  label                TEXT NOT NULL DEFAULT 'V1',
  status               TEXT NOT NULL DEFAULT 'review'
                         CHECK (status IN ('review', 'approved', 'superseded', 'failed')),
  note                 TEXT,
  generation_source    TEXT DEFAULT 'initial'
                         CHECK (generation_source IN ('initial', 'regenerated', 'manual')),
  regeneration_job_id  UUID,
  created_by           UUID,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, version_number)
);

ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "workspace_members_content_versions" ON content_versions FOR ALL
    USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_content_versions_story    ON content_versions(story_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_workspace ON content_versions(workspace_id);

-- ── studio_blocks ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_blocks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  version_id     UUID REFERENCES content_versions(id) ON DELETE SET NULL,
  workspace_id   UUID NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  label          TEXT NOT NULL,
  start_tc       TEXT NOT NULL DEFAULT '00:00',
  end_tc         TEXT NOT NULL DEFAULT '00:00',
  source_type    TEXT NOT NULL DEFAULT 'ai_generated'
                   CHECK (source_type IN ('user_asset','ai_generated','licensed','text','voice','caption')),
  editable       BOOLEAN DEFAULT TRUE,
  locked_reason  TEXT,
  status         TEXT DEFAULT 'ok',
  metadata_json  JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE studio_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "workspace_members_studio_blocks" ON studio_blocks FOR ALL
    USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_studio_blocks_story     ON studio_blocks(story_id);
CREATE INDEX IF NOT EXISTS idx_studio_blocks_version   ON studio_blocks(version_id);
CREATE INDEX IF NOT EXISTS idx_studio_blocks_workspace ON studio_blocks(workspace_id);

-- ── edit_requests ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS edit_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id          UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  version_id        UUID REFERENCES content_versions(id) ON DELETE SET NULL,
  block_id          UUID REFERENCES studio_blocks(id) ON DELETE SET NULL,
  workspace_id      UUID NOT NULL,
  brand_profile_id  UUID,
  timecode_start    TEXT NOT NULL DEFAULT '00:00',
  timecode_end      TEXT NOT NULL DEFAULT '00:04',
  subject           TEXT,
  user_comment      TEXT NOT NULL,
  draft_instruction TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','interpreted','ready','queued','applied','rejected')),
  block_label       TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE edit_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "workspace_members_edit_requests" ON edit_requests FOR ALL
    USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_edit_requests_story     ON edit_requests(story_id);
CREATE INDEX IF NOT EXISTS idx_edit_requests_workspace ON edit_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_edit_requests_version   ON edit_requests(version_id);
CREATE INDEX IF NOT EXISTS idx_edit_requests_status    ON edit_requests(status);

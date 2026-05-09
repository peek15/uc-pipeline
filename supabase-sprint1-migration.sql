-- ═══════════════════════════════════════════════════════════
-- Commercial Hardening Sprint 1 — Supabase Migration
-- Run in Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to rerun. All statements use IF NOT EXISTS / DROP IF EXISTS.
-- Date: 2026-05-09
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- SECTION 1: RATE LIMITING
-- Replaces global._rateLimits / global._agentLimits (in-memory,
-- non-functional on Vercel serverless). Uses a shared events table
-- + PL/pgSQL function for atomic check-and-insert.
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ             DEFAULT now(),
  user_id    TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
  ON rate_limit_events (user_id, endpoint, created_at);

-- No RLS needed — this table is only written by server routes via service role.
-- Authenticated clients have no direct access.

-- Atomically counts recent events and inserts a new one.
-- Returns TRUE  if the request is allowed (under limit).
-- Returns FALSE if the request is rate-limited (over limit).
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id       TEXT,
  p_endpoint      TEXT,
  p_limit         INT,
  p_window_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Prune events outside the window to keep the table small
  DELETE FROM rate_limit_events
  WHERE created_at < now() - (p_window_seconds * 2 * INTERVAL '1 second');

  -- Count events for this user+endpoint within the window
  SELECT COUNT(*) INTO v_count
  FROM rate_limit_events
  WHERE user_id  = p_user_id
    AND endpoint = p_endpoint
    AND created_at > now() - (p_window_seconds * INTERVAL '1 second');

  -- Over limit — reject without inserting
  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  -- Under limit — record the event and allow
  INSERT INTO rate_limit_events (user_id, endpoint)
  VALUES (p_user_id, p_endpoint);

  RETURN true;
END;
$$;


-- ───────────────────────────────────────────────────────────
-- SECTION 2: WORKSPACE MEMBERS — INSERT / DELETE POLICIES
-- The original schema had no insert or delete policies on
-- workspace_members, meaning the UI could not manage membership.
-- ───────────────────────────────────────────────────────────

-- Allow:
--   (a) Any authenticated user to add themselves to the default
--       workspace (bootstrapping / first owner self-seed).
--   (b) Owners and admins to add any email to a workspace they belong to.
DROP POLICY IF EXISTS "Workspace members insert" ON workspace_members;
CREATE POLICY "Workspace members insert"
  ON workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- (a) Self-seed on default workspace (no prior membership required)
    (
      workspace_id = '00000000-0000-0000-0000-000000000001'
      AND (user_id = auth.uid() OR lower(email) = lower(auth.email()))
    )
    OR
    -- (b) Owner/admin adds anyone to a workspace they belong to
    (
      is_workspace_member(workspace_id)
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_members.workspace_id
          AND (wm.user_id = auth.uid() OR lower(wm.email) = lower(auth.email()))
          AND wm.role IN ('owner', 'admin')
      )
    )
  );

-- Allow owners and admins to remove any member (except the last owner).
-- The "last owner" guard is enforced in the API route, not here,
-- because SQL cannot easily count remaining owners in a DELETE policy.
DROP POLICY IF EXISTS "Workspace admins delete members" ON workspace_members;
CREATE POLICY "Workspace admins delete members"
  ON workspace_members FOR DELETE
  TO authenticated
  USING (
    is_workspace_member(workspace_id)
    AND EXISTS (
      SELECT 1 FROM workspace_members wm2
      WHERE wm2.workspace_id = workspace_members.workspace_id
        AND (wm2.user_id = auth.uid() OR lower(wm2.email) = lower(auth.email()))
        AND wm2.role IN ('owner', 'admin')
    )
  );


-- ───────────────────────────────────────────────────────────
-- SECTION 3: SEED YOURSELF AS OWNER (run manually once)
--
-- The statements below are commented out intentionally.
-- Run them in the SQL Editor while logged in AS the Supabase
-- service role (or use Dashboard → Table Editor).
--
-- Replace 'your-email@peekmedia.cc' with your actual login email.
-- After this, the default workspace is accessible only to members
-- of workspace_members (RLS already enforces this for other workspaces;
-- the all-zeros bypass in current policies remains until you remove it
-- in the next migration step described below).
-- ───────────────────────────────────────────────────────────

-- STEP 3a — Insert yourself as owner:
--
-- INSERT INTO workspace_members (workspace_id, email, role)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'your-email@peekmedia.cc',
--   'owner'
-- )
-- ON CONFLICT (workspace_id, email) DO UPDATE SET role = 'owner';

-- STEP 3b — OPTIONAL: Tighten default workspace policy (run AFTER step 3a).
-- This removes the all-zeros bypass so ALL workspaces require membership.
-- Do NOT run this until you have confirmed step 3a succeeded and your
-- login still works.
--
-- DROP POLICY IF EXISTS "Tenant stories access" ON stories;
-- CREATE POLICY "Tenant stories access"
--   ON stories FOR ALL
--   TO authenticated
--   USING (is_workspace_member(workspace_id))
--   WITH CHECK (is_workspace_member(workspace_id));
--
-- DROP POLICY IF EXISTS "Tenant brand profiles access" ON brand_profiles;
-- CREATE POLICY "Tenant brand profiles access"
--   ON brand_profiles FOR ALL
--   TO authenticated
--   USING (is_workspace_member(workspace_id))
--   WITH CHECK (is_workspace_member(workspace_id));
--
-- (Repeat the same pattern for audit_log, ai_calls, asset_library,
--  visual_assets, agent_feedback, intelligence_insights,
--  performance_snapshots, campaigns, story_documents.)


-- ───────────────────────────────────────────────────────────
-- SECTION 4: VERIFY
-- Run these SELECTs after applying the migration to confirm state.
-- ───────────────────────────────────────────────────────────

-- SELECT COUNT(*) FROM rate_limit_events;                           -- should be 0
-- SELECT proname FROM pg_proc WHERE proname = 'check_rate_limit';   -- should return 1 row
-- SELECT policyname FROM pg_policies WHERE tablename = 'workspace_members';
-- SELECT * FROM workspace_members WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

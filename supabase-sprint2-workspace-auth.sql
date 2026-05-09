-- ═══════════════════════════════════════════════════════════
-- Commercial Hardening Sprint 2 — Supabase Migration
-- Run in Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to rerun. All statements use IF NOT EXISTS / DROP IF EXISTS.
-- Date: 2026-05-09
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- SECTION 1: WORKSPACE INSERT POLICY
--
-- Allows any authenticated user to create a new workspace.
-- The /api/workspace server route uses service role to insert
-- both the workspace row and the owner membership atomically,
-- so this policy is belt-and-suspenders for direct client calls.
-- ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users create workspaces" ON workspaces;
CREATE POLICY "Authenticated users create workspaces"
  ON workspaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);


-- ───────────────────────────────────────────────────────────
-- SECTION 2: workspace_members — allow user_id lookup
--
-- The Sprint 1 INSERT policy uses auth.email() for matching.
-- When a user signs in for the first time via Google OAuth, their
-- auth.uid() may not be populated in workspace_members yet (the
-- row was inserted by email only). This section ensures the
-- is_workspace_member() function resolves both paths.
--
-- No schema change needed — is_workspace_member() already checks
-- both user_id = auth.uid() AND lower(email) = lower(auth.email()).
-- This section is informational / for documentation only.
-- ───────────────────────────────────────────────────────────

-- No-op: is_workspace_member() already handles both columns.
-- See supabase-schema.sql for the current function definition.


-- ───────────────────────────────────────────────────────────
-- SECTION 3: Performance — index for email-based membership lookup
--
-- Google OAuth users are often matched by email rather than user_id
-- until the workspace_members row is linked to their auth.uid().
-- This index speeds up is_workspace_member() for both paths.
-- ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workspace_members_email
  ON workspace_members (lower(email));

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
  ON workspace_members (user_id)
  WHERE user_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────
-- SECTION 4: Backfill user_id in workspace_members
--
-- If a user was added by email before their first login, their
-- workspace_members row has no user_id. This statement backfills
-- user_id from auth.users where the email matches.
--
-- Run once after all invited users have logged in at least once.
-- Safe to rerun — only updates rows where user_id IS NULL.
-- ───────────────────────────────────────────────────────────

-- UPDATE workspace_members wm
-- SET user_id = u.id
-- FROM auth.users u
-- WHERE lower(u.email) = lower(wm.email)
--   AND wm.user_id IS NULL;


-- ───────────────────────────────────────────────────────────
-- SECTION 5: VERIFY
-- Run these SELECTs after applying the migration to confirm state.
-- ───────────────────────────────────────────────────────────

-- SELECT policyname FROM pg_policies WHERE tablename = 'workspaces';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'workspace_members';
-- SELECT workspace_id, email, role, user_id FROM workspace_members ORDER BY created_at;

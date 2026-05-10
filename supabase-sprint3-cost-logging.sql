-- ═══════════════════════════════════════════════════════════
-- Commercial Hardening Sprint 3 — Cost Logging Migration
-- Run in Supabase SQL Editor. Safe to rerun.
-- Date: 2026-05-10
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- SECTION 1: Add cost_center and cost_category to ai_calls
--
-- cost_center  — which product area drove the spend
--   values: research | script | translation | voice | visual |
--           onboarding | compliance | support | reporting |
--           studio_future | internal_admin | workspace_ops
-- cost_category — type of spend
--   values: generation | compliance | internal_admin
-- ───────────────────────────────────────────────────────────

ALTER TABLE ai_calls
  ADD COLUMN IF NOT EXISTS cost_center   TEXT,
  ADD COLUMN IF NOT EXISTS cost_category TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_calls_cost_center
  ON ai_calls (cost_center)
  WHERE cost_center IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_calls_cost_category
  ON ai_calls (cost_category)
  WHERE cost_category IS NOT NULL;


-- ───────────────────────────────────────────────────────────
-- SECTION 2: cost_events table
--
-- Purpose: track non-AI-token costs such as per-seat fees,
-- storage overages, or manual cost entries for budgeting.
-- Distinct from ai_calls (which tracks per-call LLM costs).
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     TEXT,         -- user email who logged it
  cost_center     TEXT NOT NULL,
  cost_category   TEXT NOT NULL,
  provider_name   TEXT,
  description     TEXT NOT NULL,
  amount_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  period_start    DATE,
  period_end      DATE,
  metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_cost_events_workspace_id
  ON cost_events (workspace_id);

CREATE INDEX IF NOT EXISTS idx_cost_events_cost_center
  ON cost_events (cost_center);

CREATE INDEX IF NOT EXISTS idx_cost_events_created_at
  ON cost_events (created_at DESC);


-- ───────────────────────────────────────────────────────────
-- SECTION 3: RLS for cost_events
--
-- Workspace members can read their workspace's cost events.
-- Only owners/admins should insert (enforced at API layer,
-- not RLS — adding a permissive member read + owner insert here).
-- ───────────────────────────────────────────────────────────

ALTER TABLE cost_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read cost_events" ON cost_events;
CREATE POLICY "Workspace members read cost_events"
  ON cost_events FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role insert cost_events" ON cost_events;
CREATE POLICY "Service role insert cost_events"
  ON cost_events FOR INSERT
  TO service_role
  WITH CHECK (true);


-- ───────────────────────────────────────────────────────────
-- SECTION 4: VERIFY
-- ───────────────────────────────────────────────────────────

-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ai_calls' AND column_name IN ('cost_center','cost_category');

-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'cost_events';

-- SELECT indexname FROM pg_indexes WHERE tablename IN ('ai_calls','cost_events')
--   AND indexname LIKE '%cost%';

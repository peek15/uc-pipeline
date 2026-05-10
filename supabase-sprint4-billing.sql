-- ═══════════════════════════════════════════════════════════
-- Commercial Hardening Sprint 4 — Billing Schema Migration
-- Run in Supabase SQL Editor. Safe to rerun.
-- Date: 2026-05-10
-- ═══════════════════════════════════════════════════════════
--
-- Adds workspace_billing table (Option B — separate table).
-- Does NOT modify the existing workspaces table.
--
-- plan_key values: studio_starter | studio_growth | studio_scale | enterprise
-- subscription_status values: trialing | active | past_due | canceled |
--                              unpaid | incomplete | expired | paused | manual
-- billing_period values: monthly | annual | manual
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- SECTION 1: workspace_billing table
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_billing (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID        NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Plan & status
  plan_key               TEXT        NOT NULL DEFAULT 'studio_starter',
  subscription_status    TEXT        NOT NULL DEFAULT 'trialing',
  billing_period         TEXT,                                  -- monthly | annual | manual | NULL

  -- Stripe identifiers (NULL until Stripe checkout completes)
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,

  -- Billing contact
  billing_email          TEXT,

  -- Period tracking
  trial_ends_at          TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,

  -- Audit
  billing_updated_at     TIMESTAMPTZ
);


-- ───────────────────────────────────────────────────────────
-- SECTION 2: Indexes
-- ───────────────────────────────────────────────────────────

-- Webhook lookups by Stripe IDs (unique once set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_billing_stripe_customer
  ON workspace_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_billing_stripe_subscription
  ON workspace_billing (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Plan-level queries (e.g. count of active starter workspaces)
CREATE INDEX IF NOT EXISTS idx_workspace_billing_plan_key
  ON workspace_billing (plan_key);

CREATE INDEX IF NOT EXISTS idx_workspace_billing_status
  ON workspace_billing (subscription_status);


-- ───────────────────────────────────────────────────────────
-- SECTION 3: RLS
-- ───────────────────────────────────────────────────────────

ALTER TABLE workspace_billing ENABLE ROW LEVEL SECURITY;

-- Members can read their own workspace billing
DROP POLICY IF EXISTS "Workspace members read billing" ON workspace_billing;
CREATE POLICY "Workspace members read billing"
  ON workspace_billing FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

-- Only service role can insert/update billing rows
-- (all writes go through API routes or Stripe webhook with service role client)
DROP POLICY IF EXISTS "Service role write billing" ON workspace_billing;
CREATE POLICY "Service role write billing"
  ON workspace_billing FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ───────────────────────────────────────────────────────────
-- SECTION 4: Seed default workspace billing row
--
-- Seeds the Uncle Carter default workspace with a 'manual'
-- billing record so it renders cleanly in the Billing UI.
-- Skip if a row already exists.
-- ───────────────────────────────────────────────────────────

INSERT INTO workspace_billing (workspace_id, plan_key, subscription_status, billing_period)
VALUES ('00000000-0000-0000-0000-000000000001', 'studio_starter', 'manual', 'manual')
ON CONFLICT (workspace_id) DO NOTHING;


-- ───────────────────────────────────────────────────────────
-- SECTION 5: VERIFY
-- ───────────────────────────────────────────────────────────

-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'workspace_billing';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'workspace_billing';
-- SELECT workspace_id, plan_key, subscription_status FROM workspace_billing;

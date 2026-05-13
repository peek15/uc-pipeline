-- Commercial Hardening: Onboarding fact confirmation
-- Extends extracted facts so users can confirm, edit, reject, or mark inferred
-- onboarding facts as unsure before final strategy approval.

ALTER TABLE onboarding_extracted_facts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'inferred'
    CHECK (status IN ('inferred','confirmed','edited','rejected','unsure')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_onboarding_facts_status
  ON onboarding_extracted_facts (session_id, status, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════
-- Commercial Hardening Sprint 7 — Privacy / Data Protection Foundation
--
-- Adds data classification, privacy modes, safe logging metadata,
-- source document/chunk foundations, retention fields, and privacy
-- request scaffolding. Safe to rerun.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS privacy_mode TEXT DEFAULT 'standard'
    CHECK (privacy_mode IN ('standard','confidential','enhanced_privacy','enterprise_custom')),
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active';

ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS default_data_class TEXT DEFAULT 'D1_BUSINESS_STANDARD'
    CHECK (default_data_class IN ('D0_PUBLIC','D1_BUSINESS_STANDARD','D2_CONFIDENTIAL','D3_SENSITIVE','D4_SECRET')),
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active';

ALTER TABLE ai_calls
  ADD COLUMN IF NOT EXISTS data_class TEXT,
  ADD COLUMN IF NOT EXISTS privacy_mode TEXT,
  ADD COLUMN IF NOT EXISTS provider_privacy_profile TEXT,
  ADD COLUMN IF NOT EXISTS operation_type TEXT,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_calls_privacy
  ON ai_calls (data_class, privacy_mode);
CREATE INDEX IF NOT EXISTS idx_ai_calls_payload_hash
  ON ai_calls (payload_hash);

ALTER TABLE cost_events
  ADD COLUMN IF NOT EXISTS data_class TEXT,
  ADD COLUMN IF NOT EXISTS privacy_mode TEXT,
  ADD COLUMN IF NOT EXISTS provider_privacy_profile TEXT,
  ADD COLUMN IF NOT EXISTS operation_type TEXT,
  ADD COLUMN IF NOT EXISTS model_or_service TEXT,
  ADD COLUMN IF NOT EXISTS input_units NUMERIC,
  ADD COLUMN IF NOT EXISTS output_units NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_type TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS billable_to_client BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allocatable_to_workspace BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS related_job_id TEXT,
  ADD COLUMN IF NOT EXISTS related_asset_id UUID,
  ADD COLUMN IF NOT EXISTS related_deliverable_id UUID,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;

ALTER TABLE story_documents
  ADD COLUMN IF NOT EXISTS data_class TEXT DEFAULT 'D1_BUSINESS_STANDARD',
  ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retention_delete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extracted_text_ref TEXT;

ALTER TABLE asset_library
  ADD COLUMN IF NOT EXISTS data_class TEXT DEFAULT 'D1_BUSINESS_STANDARD',
  ADD COLUMN IF NOT EXISTS privacy_mode_used TEXT,
  ADD COLUMN IF NOT EXISTS provider_privacy_profile TEXT,
  ADD COLUMN IF NOT EXISTS rights_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consent_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_document_ref TEXT,
  ADD COLUMN IF NOT EXISTS client_owned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retention_delete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE visual_assets
  ADD COLUMN IF NOT EXISTS data_class TEXT DEFAULT 'D1_BUSINESS_STANDARD',
  ADD COLUMN IF NOT EXISTS privacy_mode_used TEXT,
  ADD COLUMN IF NOT EXISTS provider_privacy_profile TEXT,
  ADD COLUMN IF NOT EXISTS rights_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'unknown';

ALTER TABLE onboarding_sources
  ADD COLUMN IF NOT EXISTS data_class TEXT DEFAULT 'D1_BUSINESS_STANDARD',
  ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retention_delete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selected_for_ai BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  original_file_ref TEXT,
  extracted_text_ref TEXT,
  data_class TEXT NOT NULL DEFAULT 'D1_BUSINESS_STANDARD'
    CHECK (data_class IN ('D0_PUBLIC','D1_BUSINESS_STANDARD','D2_CONFIDENTIAL','D3_SENSITIVE','D4_SECRET')),
  retention_status TEXT NOT NULL DEFAULT 'active'
    CHECK (retention_status IN ('active','delete_requested','scheduled_for_deletion','deleted','legal_hold')),
  retention_delete_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_documents_workspace
  ON source_documents (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_documents_brand
  ON source_documents (brand_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  chunk_index INT NOT NULL,
  chunk_text TEXT,
  chunk_ref TEXT,
  data_class TEXT NOT NULL DEFAULT 'D1_BUSINESS_STANDARD',
  sensitivity_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document
  ON document_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_workspace
  ON document_chunks (workspace_id, brand_profile_id);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('export','delete_workspace','delete_brand','retention_summary')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','completed','rejected','cancelled')),
  requested_by UUID,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_workspace
  ON privacy_requests (workspace_id, created_at DESC);

ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read source documents" ON source_documents;
CREATE POLICY "Workspace members read source documents"
  ON source_documents FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members write source documents" ON source_documents;
CREATE POLICY "Workspace members write source documents"
  ON source_documents FOR ALL TO authenticated
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members read document chunks" ON document_chunks;
CREATE POLICY "Workspace members read document chunks"
  ON document_chunks FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members write document chunks" ON document_chunks;
CREATE POLICY "Workspace members write document chunks"
  ON document_chunks FOR ALL TO authenticated
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace admins read privacy requests" ON privacy_requests;
CREATE POLICY "Workspace admins read privacy requests"
  ON privacy_requests FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace admins create privacy requests" ON privacy_requests;
CREATE POLICY "Workspace admins create privacy requests"
  ON privacy_requests FOR INSERT TO authenticated
  WITH CHECK (is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS "Workspace admins update privacy requests" ON privacy_requests;
CREATE POLICY "Workspace admins update privacy requests"
  ON privacy_requests FOR UPDATE TO authenticated
  USING (is_workspace_admin(workspace_id))
  WITH CHECK (is_workspace_admin(workspace_id));

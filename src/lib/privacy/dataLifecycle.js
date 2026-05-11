import { DATA_CLASSES, DEFAULT_DATA_CLASS, normalizeDataClass } from "./privacyTypes";
import { stripSensitiveFields } from "./safeLogging";

export const RETENTION_STATUSES = {
  ACTIVE: "active",
  DELETE_REQUESTED: "delete_requested",
  SCHEDULED_FOR_DELETION: "scheduled_for_deletion",
  DELETED: "deleted",
  LEGAL_HOLD: "legal_hold",
};

export function defaultRetentionDeleteAt({ sourceType = "raw_upload", createdAt = new Date() } = {}) {
  const created = new Date(createdAt);
  const days = sourceType === "raw_upload" ? 60 : sourceType === "extracted_text" ? 180 : null;
  if (!days) return null;
  created.setDate(created.getDate() + days);
  return created.toISOString();
}

export function shouldDeleteNow(record) {
  if (!record?.retention_delete_at) return false;
  if (record.retention_status === RETENTION_STATUSES.LEGAL_HOLD) return false;
  return new Date(record.retention_delete_at).getTime() <= Date.now();
}

export function markWorkspaceForDeletion({ workspaceId, requestedBy }) {
  return {
    workspace_id: workspaceId,
    deletion_requested_at: new Date().toISOString(),
    retention_status: RETENTION_STATUSES.DELETE_REQUESTED,
    requested_by: requestedBy || null,
  };
}

export function markBrandDataForDeletion({ workspaceId, brandProfileId, requestedBy }) {
  return {
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId,
    deletion_requested_at: new Date().toISOString(),
    retention_status: RETENTION_STATUSES.DELETE_REQUESTED,
    requested_by: requestedBy || null,
  };
}

export const EXPORTABLE_TABLES = [
  "workspaces",
  "brand_profiles",
  "stories",
  "campaigns",
  "story_documents",
  "asset_library",
  "visual_assets",
  "onboarding_sessions",
  "onboarding_sources",
  "onboarding_extracted_facts",
  "onboarding_clarifications",
  "onboarding_drafts",
  "content_compliance_checks",
  "content_approvals",
  "content_exports",
  "content_audit_events",
  "ai_calls",
  "cost_events",
  "audit_log",
];

export function listExportableWorkspaceData() {
  return EXPORTABLE_TABLES;
}

export function buildWorkspaceExportManifest({ workspaceId, brandProfileId = null, requestedBy = null, tables = EXPORTABLE_TABLES } = {}) {
  return stripSensitiveFields({
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId,
    requested_by: requestedBy,
    created_at: new Date().toISOString(),
    data_class: normalizeDataClass(DEFAULT_DATA_CLASS),
    excludes: [
      "provider secret values",
      "raw provider credentials",
      "service role keys",
      "raw AI prompts/responses beyond stored product content",
      DATA_CLASSES.D4_SECRET,
    ],
    tables,
  });
}

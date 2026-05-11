export function requiresAcknowledgement(check) {
  return check?.status === "needs_acknowledgement";
}

export function isBlocked(check) {
  return check?.status === "blocked" || check?.risk_level === "critical";
}

export function canApprove({ check, acknowledged = false, internalOnly = false } = {}) {
  if (internalOnly) return { ok: true, reason: "internal_export" };
  if (!check) return { ok: false, reason: "missing_compliance_check" };
  if (isBlocked(check)) return { ok: false, reason: "blocked_compliance_check" };
  if (requiresAcknowledgement(check) && !acknowledged) return { ok: false, reason: "acknowledgement_required" };
  return { ok: true, reason: "ready" };
}

export function canExport({ approval, exportType = "copy_package", check } = {}) {
  if (exportType === "draft" || exportType === "internal") return { ok: true, reason: "internal_export" };
  if (isBlocked(check)) return { ok: false, reason: "blocked_compliance_check" };
  if (approval?.approval_status !== "approved") return { ok: false, reason: "approval_required" };
  return { ok: true, reason: "ready" };
}


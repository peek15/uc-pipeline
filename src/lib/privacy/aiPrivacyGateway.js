import { assertProviderAllowedForData, getProviderPrivacyProfile } from "./providerPrivacyProfiles";
import { DEFAULT_DATA_CLASS, DEFAULT_PRIVACY_MODE, DATA_CLASSES, normalizeDataClass, normalizePrivacyMode } from "./privacyTypes";
import { buildProviderSafePayload } from "./promptMinimization";
import { hashPayload, summarizeError } from "./safeLogging";

export function preparePrivacyCheckedAI({
  workspaceId,
  brandProfileId,
  userId = null,
  operationType = "ai_call",
  providerKey,
  model = null,
  messages = [],
  system = "",
  dataClass = DEFAULT_DATA_CLASS,
  privacyMode = DEFAULT_PRIVACY_MODE,
  costCenter = null,
  costCategory = null,
  metadata = {},
}) {
  if (!workspaceId) throw new Error("AI Privacy Gateway requires workspaceId");
  if (!providerKey) throw new Error("AI Privacy Gateway requires providerKey");

  const normalizedDataClass = normalizeDataClass(dataClass);
  const normalizedPrivacyMode = normalizePrivacyMode(privacyMode);
  if (normalizedDataClass === DATA_CLASSES.D4_SECRET) {
    const error = new Error("D4_SECRET payloads cannot be sent to AI providers.");
    error.code = "D4_SECRET_BLOCKED";
    throw error;
  }

  const providerProfile = assertProviderAllowedForData({
    providerKey,
    dataClass: normalizedDataClass,
    privacyMode: normalizedPrivacyMode,
    operationType,
  });
  const safePayload = buildProviderSafePayload({
    messages,
    system,
    dataClass: normalizedDataClass,
    privacyMode: normalizedPrivacyMode,
    operationType,
  });

  return {
    workspaceId,
    brandProfileId,
    userId,
    operationType,
    providerKey,
    providerProfile,
    model,
    dataClass: normalizedDataClass,
    privacyMode: normalizedPrivacyMode,
    costCenter,
    costCategory,
    metadata: {
      operationType,
      provider_privacy_profile: providerProfile.provider_key,
      payload_hash: safePayload.payloadHash,
      redaction_summary: safePayload.redactionSummary,
      warnings: safePayload.warnings,
      ...metadata,
    },
    messages: safePayload.sanitizedMessages,
    system: safePayload.sanitizedSystem,
    payloadHash: safePayload.payloadHash,
  };
}

export async function runPrivacyCheckedAI(args) {
  const prepared = preparePrivacyCheckedAI(args);
  return {
    prepared,
    output: null,
    todo: [
      "Wire concrete provider execution through internal provider abstractions.",
      "Enable verified ZDR/no-retention provider routing per workspace.",
      "Support client-owned provider credentials.",
      "Add uploaded file chunk minimization and selected-snippet retrieval.",
      "Add enterprise custom routing policies.",
    ],
  };
}

export function buildPrivacyLogFields({ prepared, providerKey, dataClass, privacyMode, payload, success = true, error = null } = {}) {
  const profile = prepared?.providerProfile || getProviderPrivacyProfile(providerKey);
  const safeError = error ? summarizeError(error) : {};
  return {
    data_class: prepared?.dataClass || normalizeDataClass(dataClass),
    privacy_mode: prepared?.privacyMode || normalizePrivacyMode(privacyMode),
    provider_privacy_profile: profile?.provider_key || null,
    payload_hash: prepared?.payloadHash || (payload ? hashPayload(payload) : null),
    success,
    ...safeError,
  };
}

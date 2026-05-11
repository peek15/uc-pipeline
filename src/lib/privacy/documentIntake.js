import { DATA_CLASSES, normalizeDataClass } from "./privacyTypes";
import { classifyTextSensitivity, truncateToLimit } from "./promptMinimization";
import { defaultRetentionDeleteAt, RETENTION_STATUSES } from "./dataLifecycle";

export function chunkText(text = "", { chunkSize = 1800, maxChunks = 12 } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks = [];
  for (let i = 0; i < clean.length && chunks.length < maxChunks; i += chunkSize) {
    chunks.push(clean.slice(i, i + chunkSize));
  }
  return chunks;
}

export function classifyDocumentSource({ sourceType, text, declaredDataClass }) {
  if (declaredDataClass) return normalizeDataClass(declaredDataClass);
  if (sourceType === "website" || sourceType === "social_page") return DATA_CLASSES.D0_PUBLIC;
  if (!text) return DATA_CLASSES.D1_BUSINESS_STANDARD;
  return classifyTextSensitivity(text);
}

export function buildSourceDocumentRecord({
  workspaceId,
  brandProfileId,
  sourceType,
  originalFileRef = null,
  extractedTextRef = null,
  dataClass,
  createdBy = null,
}) {
  return {
    workspace_id: workspaceId,
    brand_profile_id: brandProfileId || null,
    source_type: sourceType,
    original_file_ref: originalFileRef,
    extracted_text_ref: extractedTextRef,
    data_class: normalizeDataClass(dataClass),
    retention_status: RETENTION_STATUSES.ACTIVE,
    retention_delete_at: defaultRetentionDeleteAt({ sourceType: originalFileRef ? "raw_upload" : "extracted_text" }),
    created_by: createdBy,
  };
}

export function buildDocumentChunks({ documentId, workspaceId, brandProfileId, text, dataClass }) {
  return chunkText(text).map((chunk, index) => {
    const chunkClass = classifyTextSensitivity(chunk);
    const sensitivityFlags = [];
    if (chunkClass === DATA_CLASSES.D2_CONFIDENTIAL) sensitivityFlags.push("confidential_terms");
    if (chunkClass === DATA_CLASSES.D3_SENSITIVE) sensitivityFlags.push("personal_data_possible");
    if (chunkClass === DATA_CLASSES.D4_SECRET) sensitivityFlags.push("secret_possible");
    return {
      document_id: documentId,
      workspace_id: workspaceId,
      brand_profile_id: brandProfileId || null,
      chunk_index: index,
      chunk_text: truncateToLimit(chunk, 2000),
      data_class: normalizeDataClass(dataClass || chunkClass),
      sensitivity_flags: sensitivityFlags,
    };
  });
}

export function selectSnippetsForAI(chunks = [], { maxSnippets = 4, maxChars = 4000 } = {}) {
  const selected = [];
  let chars = 0;
  for (const chunk of chunks) {
    const text = String(chunk.chunk_text || "");
    if (!text || chars + text.length > maxChars) continue;
    selected.push(chunk);
    chars += text.length;
    if (selected.length >= maxSnippets) break;
  }
  return selected;
}

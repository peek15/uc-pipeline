// ═══════════════════════════════════════════════════════════
// summarize-content.js — Summarize an uploaded brand doc.
// Extracted from SettingsModal.handleAssetUpload (around line 692).
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 200,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.excerpt — first ~2000 chars of document text
 */
export function build({ excerpt }) {
  return `Summarize this brand document in 2-3 sentences, focusing on what's useful for content generation (voice, restrictions, audience, key messages).

Document excerpt:
${excerpt}

Summary only. No preamble.`;
}

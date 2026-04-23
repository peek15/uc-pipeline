// ═══════════════════════════════════════════════════════════
// translate-script.js — Translate a script to a target language.
// Extracted from ScriptView.translateLang() and page.handleProduce().
// ═══════════════════════════════════════════════════════════

import { LANGS } from "@/lib/constants";

export const defaults = {
  maxTokens: 600,
  model:     "sonnet",
};

/**
 * @param {object} params
 * @param {string} params.script    — English source
 * @param {string} params.lang_key  — "fr" | "es" | "pt"
 */
export function build({ script, lang_key }) {
  const langName = LANGS.find(l => l.key === lang_key)?.name || lang_key;
  return `Translate this Uncle Carter sports storytelling script to ${langName}. Keep the same tone: calm, warm, storytelling uncle. Translate "Forty seconds." and the closing line naturally. Same rhythm. 110-150 words.

Return ONLY the translated script.

Original:
${script}`;
}

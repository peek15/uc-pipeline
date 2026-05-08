// ═══════════════════════════════════════════════════════════
// translate-script.js — Translate a script to a target language.
// Extracted from ScriptView.translateLang() and page.handleProduce().
// ═══════════════════════════════════════════════════════════

import { LANGS } from "@/lib/constants";

export const defaults = {
  maxTokens: 600,
  model:     "sonnet",
};

export function build({ script, lang_key, brand_config = null, instruction = null, current_translation = null }) {
  const langName  = brand_config?.languages?.find(l => l.key === lang_key)?.name || LANGS.find(l => l.key === lang_key)?.name || lang_key;
  const brandName = brand_config?.brand_name || "this brand";
  const voice     = brand_config?.voice || "the same tone and rhythm";
  const closing   = brand_config?.closing_line ? ` Preserve the meaning of the closing line: "${brand_config.closing_line}".` : "";

  if (instruction && current_translation) {
    return `Revise this ${langName} translation of a ${brandName} script per the instruction below. Keep brand voice: ${voice}.${closing} Return ONLY the revised translation.

Instruction: ${instruction}

Current ${langName} translation:
${current_translation}

Original English:
${script}`;
  }

  return `Translate this ${brandName} script to ${langName}. Keep the brand voice: ${voice}.${closing} Same rhythm. 110-150 words.

Return ONLY the translated script.

Original:
${script}`;
}

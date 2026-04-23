// ═══════════════════════════════════════════════════════════
// onboarding-chat.js — Brand profile onboarding assistant.
// Extracted from SettingsModal.sendObMessage (around line 613).
// ═══════════════════════════════════════════════════════════

export const defaults = {
  maxTokens: 800,
  model:     "haiku",
};

/**
 * @param {object} params
 * @param {string} params.current_brand_json  — JSON.stringify of settings.brand
 * @param {string} params.history             — "User: ...\n\nAssistant: ..."
 */
export function build({ current_brand_json, history }) {
  return `You are an onboarding assistant helping set up a brand profile for an AI content production tool.

Current brand settings:
${current_brand_json}

Conversation so far:
${history}

Your job:
1. Ask short, focused questions to fill in missing brand info (voice, avoid, goals, audience, locked elements like a closing line)
2. If a document was shared, extract what you can and only ask about genuine gaps
3. When you have enough info, output a JSON block with extracted fields
4. Be conversational and fast — don't ask more than 2 questions at once

If you have enough info to extract brand fields, end your response with:
<brand_extract>
{
  "name": "...",
  "voice": "...",
  "avoid": "...",
  "goal_primary": "community|reach|conversion|awareness",
  "goal_secondary": "community|reach|conversion|awareness",
  "content_type": "narrative|advertising|educational|product|custom",
  "locked_elements": ["..."]
}
</brand_extract>

Otherwise just respond conversationally. Keep it short.`;
}

/**
 * Extract the brand block if present. Returns { clean_response, extracted|null }.
 */
export function parse(text) {
  const extractMatch = text.match(/<brand_extract>([\s\S]*?)<\/brand_extract>/);
  const clean_response = text.replace(/<brand_extract>[\s\S]*?<\/brand_extract>/, "").trim();
  let extracted = null;
  if (extractMatch) {
    try { extracted = JSON.parse(extractMatch[1].trim()); } catch {}
  }
  return { clean_response, extracted };
}

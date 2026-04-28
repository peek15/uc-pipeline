// ═══════════════════════════════════════════════════════════
// voice-producer agent
// v3.11.0
//
// Orchestrates voice generation per language. Two modes:
//   - cascade: generate EN, surface for approval, then FR/ES/PT in parallel
//   - auto:    generate all 4 in parallel
//
// Reads:    story scripts (en, fr, es, pt), brand voice config
// Outputs:  per-language audio files saved to storage, audio_refs on story
// Triggers: user clicks "Generate voice" in ProductionView
//
// Brand-agnostic: voice IDs come from brand's voice provider config.
// ═══════════════════════════════════════════════════════════

import { getVoiceProvider, resolveVoiceId } from "@/lib/providers/voice/providers-voice";
import { getStorageProvider } from "@/lib/providers/storage/storage";
import { logFeedback, hybridConfidence } from "./base";
import { supabase } from "@/lib/db";

export const AGENT_NAME = "voice-producer";
export const defaults  = { /* no model — this agent doesn't call Claude */ };

/**
 * Generate audio for ONE language.
 *
 * @param {object} opts
 * @param {object} opts.story
 * @param {string} opts.language               'en' | 'fr' | 'es' | 'pt' | ...
 * @param {string} opts.brand_profile_id
 * @param {string} [opts.workspace_id]
 * @returns {Promise<{ audio_url, language, cost_estimate, latency_ms, confidence, ai_call_id }>}
 */
export async function runOne({ story, language, brand_profile_id, workspace_id = null }) {
  const text = pickScript(story, language);
  if (!text) throw new Error(`No ${language.toUpperCase()} script for story "${story.title}"`);

  const voice_id = await resolveVoiceId(brand_profile_id, language);
  if (!voice_id) throw new Error(`No voice_id configured for language="${language}". Set one in Settings → Providers → Voice.`);

  const voice = await getVoiceProvider(brand_profile_id);
  const storage = await getStorageProvider(brand_profile_id);

  // Generate
  const result = await voice.generate({ text, voice_id, language });

  // Upload to storage
  const key = `voice/${brand_profile_id}/${story.id}/${language}.mp3`;
  const { url } = await storage.upload({
    key,
    file: result.audio_blob,
    contentType: result.mime,
  });

  // Log to ai_calls (best-effort — voice calls are tracked here too even
  // though they don't go through the Claude runner)
  let ai_call_id = null;
  try {
    const { data } = await supabase.from("ai_calls").insert({
      type:             "voice-generate",
      provider_name:    result.provider_name,
      model_version:    voice.config?.model_id || "default",
      tokens_input:     null,
      tokens_output:    null,
      cost_estimate:    result.cost_estimate || 0,
      story_id:         story.id,
      brand_profile_id,
      workspace_id,
      duration_ms:      result.latency_ms,
      success:          true,
    }).select("id").single();
    ai_call_id = data?.id || null;
  } catch {}

  // Heuristic confidence: did we get audio, was the text long enough, etc.
  const confidence = hybridConfidence(85, {
    has_audio:    result.audio_blob && result.audio_blob.size > 1000 ? 1 : 0,
    text_present: text.length > 50 ? 1 : 0.5,
    not_stub:     result.provider_name !== "stub" ? 1 : 0.7,
  });

  return {
    audio_url:     url,
    audio_key:     key,
    language,
    cost_estimate: result.cost_estimate || 0,
    latency_ms:    result.latency_ms,
    provider_name: result.provider_name,
    confidence,
    ai_call_id,
    duration_estimate_ms: estimateDurationMs(text),
  };
}

/**
 * Cascade flow: generate EN first (returns immediately for approval),
 * then on a separate call generate FR/ES/PT in parallel.
 *
 * For full-auto: just call runAll().
 */
export async function runEnglishOnly(opts) {
  return runOne({ ...opts, language: "en" });
}

/**
 * Generate all configured languages in parallel.
 *
 * @returns {Promise<{ results: Array, errors: Array }>}
 */
export async function runAll({ story, brand_profile_id, workspace_id = null, languages = null }) {
  // Detect available scripts
  const langs = languages || detectAvailableLanguages(story);

  const results = await Promise.allSettled(
    langs.map(lang => runOne({ story, language: lang, brand_profile_id, workspace_id }))
  );

  const successes = [];
  const errors    = [];

  results.forEach((r, i) => {
    if (r.status === "fulfilled") successes.push(r.value);
    else errors.push({ language: langs[i], error: r.reason?.message || String(r.reason) });
  });

  return { results: successes, errors };
}

/**
 * Save audio_refs on the story after a successful run.
 * Merges with existing audio_refs (for cascade flow — EN saved first,
 * then FR/ES/PT merged in).
 */
export async function persistAudioRefs(story_id, newRefs) {
  // Load existing
  const { data: row } = await supabase
    .from("stories")
    .select("audio_refs")
    .eq("id", story_id)
    .single();

  const merged = { ...(row?.audio_refs || {}) };
  for (const r of newRefs) {
    merged[r.language] = {
      url:       r.audio_url,
      key:       r.audio_key,
      duration_estimate_ms: r.duration_estimate_ms,
      provider:  r.provider_name,
      generated_at: new Date().toISOString(),
    };
  }

  const { error } = await supabase
    .from("stories")
    .update({ audio_refs: merged })
    .eq("id", story_id);
  if (error) throw error;
  return merged;
}

export async function recordFeedback(opts) {
  return logFeedback({ ...opts, agent_name: AGENT_NAME });
}

// ─── helpers ─────────────────────────────────────────────

function pickScript(story, lang) {
  const k = lang === "en" ? "script" : `script_${lang}`;
  return story?.[k] || (lang === "en" ? story?.script : null);
}

function detectAvailableLanguages(story) {
  const langs = [];
  if (story.script)    langs.push("en");
  if (story.script_fr) langs.push("fr");
  if (story.script_es) langs.push("es");
  if (story.script_pt) langs.push("pt");
  return langs;
}

// Rough estimate at 150 words/min English narration. For UX progress hints.
function estimateDurationMs(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / 150) * 60 * 1000);
}

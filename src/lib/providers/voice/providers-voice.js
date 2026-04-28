// ═══════════════════════════════════════════════════════════
// providers/voice/providers-voice.js
// v3.11.0 — real implementation, calls go through /api/provider-call.
//
// Public API:
//   getVoiceProvider(brand_id) → { generate({ text, voice_id, language }) }
//
// Returns { audio_blob, mime, cost_estimate, provider_name, latency_ms }.
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";
import { loadProviderConfig } from "../config-loader";

async function authToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function callProviderRoute(action, brand_profile_id, params) {
  const token = await authToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/provider-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify({ action, brand_profile_id, params }),
  });

  let payload = null;
  try { payload = await res.json(); } catch {}
  if (!res.ok) throw new Error(payload?.error || `provider-call ${res.status}`);
  return payload;
}

function base64ToBlob(b64, mime) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/**
 * Get voice provider for a brand. Returns object with .generate().
 */
export async function getVoiceProvider(brand_profile_id) {
  const cfg = await loadProviderConfig(brand_profile_id, "voice");
  const provider_name = cfg?.provider_name || "stub";

  return {
    name: provider_name,
    config: cfg?.config || {},

    /**
     * Generate audio for one (text, voice_id, language) tuple.
     * @returns {Promise<{ audio_blob, mime, cost_estimate, provider_name, latency_ms }>}
     */
    async generate({ text, voice_id, language = "en", model_id }) {
      if (!text)     throw new Error("voice.generate: missing text");
      if (!voice_id) throw new Error("voice.generate: missing voice_id");

      const { audio_base64, mime, cost_estimate, latency_ms } = await callProviderRoute(
        "voice.generate",
        brand_profile_id,
        { text, voice_id, language, model_id }
      );

      return {
        audio_blob:     base64ToBlob(audio_base64, mime || "audio/mp3"),
        mime:           mime || "audio/mp3",
        cost_estimate:  cost_estimate || 0,
        provider_name,
        latency_ms,
      };
    },
  };
}

/**
 * Resolve a voice_id for a (brand, language) pair.
 * Reads the array of {lang, voice_id} from brand's voice config.
 */
export async function resolveVoiceId(brand_profile_id, language) {
  const cfg = await loadProviderConfig(brand_profile_id, "voice");
  if (!cfg?.config?.voices) return null;
  const match = (cfg.config.voices || []).find(v => v.lang === language);
  return match?.voice_id || null;
}

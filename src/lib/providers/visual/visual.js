// ═══════════════════════════════════════════════════════════
// providers/visual/visual.js
// v3.11.0 — visual provider abstraction.
//
// Two slots:
//   - visual_atmospheric  (AI-generated: Flux, MidJourney, DALL-E)
//   - visual_licensed     (real photos: Pexels, Shutterstock)
//
// Public API:
//   getAtmosphericProvider(brand_id) → { generate({ prompt, count, aspect }) }
//   getLicensedProvider(brand_id)    → { search({ query, count, orientation }) }
//
// Provider selection lives elsewhere (visual-ranker agent calls
// selectVisualProvider(brand, format, archetype) — Stage 1 returns
// brand defaults, Stage 2 will use intelligence layer).
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

/**
 * Get atmospheric (AI image generation) provider for a brand.
 */
export async function getAtmosphericProvider(brand_profile_id) {
  const cfg = await loadProviderConfig(brand_profile_id, "visual_atmospheric");
  const provider_name = cfg?.provider_name || "stub";

  return {
    name: provider_name,
    config: cfg?.config || {},

    /**
     * Generate `count` images for one prompt.
     * @returns {Promise<{ images, provider_name, latency_ms }>}
     */
    async generate({ prompt, count = 1, aspect = "9:16" }) {
      if (!prompt) throw new Error("atmospheric.generate: missing prompt");

      const { images, latency_ms } = await callProviderRoute(
        "visual.generate",
        brand_profile_id,
        { prompt, count, aspect }
      );

      return { images: images || [], provider_name, latency_ms };
    },
  };
}

/**
 * Get licensed (real photo search) provider for a brand.
 */
export async function getLicensedProvider(brand_profile_id) {
  const cfg = await loadProviderConfig(brand_profile_id, "visual_licensed");
  const provider_name = cfg?.provider_name || "stub";

  return {
    name: provider_name,
    config: cfg?.config || {},

    /**
     * Search for `count` images matching query.
     * @returns {Promise<{ images, provider_name, latency_ms }>}
     */
    async search({ query, count = 6, orientation = "portrait" }) {
      if (!query) throw new Error("licensed.search: missing query");

      const { images, latency_ms } = await callProviderRoute(
        "licensed.search",
        brand_profile_id,
        { query, count, orientation }
      );

      return { images: images || [], provider_name, latency_ms };
    },
  };
}

/**
 * Stage 1 selection: returns the brand's configured providers as-is.
 * Stage 2 will replace this with intelligence-based selection.
 *
 * Single swap point — when the intelligence layer ships, only this
 * function changes. Agents and providers stay the same.
 */
export async function selectVisualProvider({ brand_profile_id, format, archetype }) {
  // For v3.11.0: configured provider per slot wins. format/archetype
  // are accepted but unused. They land here for Stage 2.
  const [atmospheric, licensed] = await Promise.all([
    loadProviderConfig(brand_profile_id, "visual_atmospheric"),
    loadProviderConfig(brand_profile_id, "visual_licensed"),
  ]);

  return {
    atmospheric: atmospheric?.provider_name || "stub",
    licensed:    licensed?.provider_name    || "stub",
    // Logged so future intelligence sees what was selected vs alternatives
    selection_reason: "stage1_brand_default",
    selection_inputs: { format, archetype },
  };
}

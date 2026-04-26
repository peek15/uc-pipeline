// ═══════════════════════════════════════════════════════════
// config-loader.js — Client-side helper for provider config.
// v3.10.0
//
// Talks to /api/provider-config. Caches CONFIG in memory per
// (brand_profile_id × provider_type) for 5 min — secrets are
// NEVER cached client-side, they live only on the server.
//
// Public API:
//   loadProviderConfig(brand_id, provider_type)   → { provider_name, config } | null
//   listProviderConfigs(brand_id)                 → [{ provider_type, provider_name, config }, ...]
//   saveProviderConfig({ brand_id, provider_type, provider_name, secrets, config })
//   testProviderConnection(brand_id, provider_type) → { ok, error, latency_ms }
//   clearProviderCache(brand_id?)                 → invalidate (after save)
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { value, expires }

function cacheKey(brand_id, provider_type) {
  return `${brand_id}::${provider_type}`;
}

async function authToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function callRoute(body) {
  const token = await authToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch("/api/provider-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await res.json(); } catch {}
  if (!res.ok) throw new Error(payload?.error || `provider-config ${res.status}`);
  return payload;
}

/**
 * Load active provider config for a brand+type.
 * Returns { provider_name, config, last_test_ok, last_test_at } or null.
 * Never returns secrets.
 */
export async function loadProviderConfig(brand_id, provider_type) {
  if (!brand_id || !provider_type) return null;
  const key = cacheKey(brand_id, provider_type);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { data } = await callRoute({
    action: "load",
    brand_profile_id: brand_id,
    provider_type,
  });

  cache.set(key, { value: data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

/**
 * List all configured providers for a brand. Config only, no secrets.
 */
export async function listProviderConfigs(brand_id) {
  if (!brand_id) return [];
  const { data } = await callRoute({
    action: "list",
    brand_profile_id: brand_id,
  });
  return data || [];
}

/**
 * Save (upsert) provider credentials + config.
 * Invalidates cache for this brand+type after save.
 */
export async function saveProviderConfig({ brand_id, provider_type, provider_name, secrets = {}, config = {} }) {
  if (!brand_id)      throw new Error("brand_id required");
  if (!provider_type) throw new Error("provider_type required");
  if (!provider_name) throw new Error("provider_name required");

  const { data } = await callRoute({
    action: "save",
    brand_profile_id: brand_id,
    provider_type,
    provider_name,
    secrets,
    config,
  });

  cache.delete(cacheKey(brand_id, provider_type));
  return data;
}

/**
 * Run a test call against the active provider. Returns { ok, error, latency_ms }.
 * Result is also persisted on the provider_secrets row (last_test_at/ok/error).
 */
export async function testProviderConnection(brand_id, provider_type) {
  if (!brand_id || !provider_type) throw new Error("brand_id and provider_type required");
  const { data } = await callRoute({
    action: "test",
    brand_profile_id: brand_id,
    provider_type,
  });
  // Invalidate cache so next load() picks up updated last_test_* fields
  cache.delete(cacheKey(brand_id, provider_type));
  return data;
}

/**
 * Manually clear the in-memory cache. Optionally scoped to one brand.
 */
export function clearProviderCache(brand_id = null) {
  if (!brand_id) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${brand_id}::`)) cache.delete(key);
  }
}

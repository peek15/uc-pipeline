// ═══════════════════════════════════════════════════════════
// providers/storage/storage.js — Storage abstraction.
// v3.10.0
//
// Same pattern as src/lib/providers/voice/providers-voice.js:
//   getStorageProvider(brand_id) → { upload, download, delete, list, sign }
//
// Implementations:
//   - supabase_storage  (default, free, works out of the box)
//   - s3                (client-owned bucket via aws-sdk)
//   - gcs               (client-owned bucket via @google-cloud/storage)
//   - stub              (in-memory, for tests / when no provider configured)
//
// Secrets and config come from /api/provider-config — this module
// itself never touches process.env or supabase directly for credentials.
//
// IMPORTANT: This module runs CLIENT-SIDE in the webapp. For S3/GCS we
// route the actual upload through a future server-side endpoint to keep
// secrets off the client. For Supabase Storage, the user's session token
// is sufficient and uploads happen direct.
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";
import { loadProviderConfig } from "../config-loader";

// ─── Provider interface ─────────────────────────────────
// Every implementation must export the same shape:
//   {
//     async upload({ key, file, contentType })  → { url, key }
//     async getSignedUrl({ key, expires_in_s }) → string
//     async delete(key)                          → void
//     async list(prefix)                         → string[]
//   }

// ─── Stub provider ──────────────────────────────────────
const stubStore = new Map(); // key -> { blob, type }

const stubProvider = {
  name: "stub",
  async upload({ key, file, contentType }) {
    stubStore.set(key, { blob: file, type: contentType });
    return { url: `stub://${key}`, key };
  },
  async getSignedUrl({ key }) {
    return stubStore.has(key) ? `stub://${key}` : null;
  },
  async delete(key) {
    stubStore.delete(key);
  },
  async list(prefix = "") {
    return Array.from(stubStore.keys()).filter(k => k.startsWith(prefix));
  },
};

// ─── Supabase Storage provider ──────────────────────────
function supabaseStorageProvider(config) {
  const bucket = config?.bucket;
  if (!bucket) throw new Error("supabase_storage: missing bucket in config");

  return {
    name: "supabase_storage",
    async upload({ key, file, contentType }) {
      const { data, error } = await supabase.storage.from(bucket).upload(key, file, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);
      const url = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
      return { url, key: data.path };
    },
    async getSignedUrl({ key, expires_in_s = 3600 }) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expires_in_s);
      if (error) throw new Error(`Sign URL failed: ${error.message}`);
      return data.signedUrl;
    },
    async delete(key) {
      const { error } = await supabase.storage.from(bucket).remove([key]);
      if (error) throw new Error(`Delete failed: ${error.message}`);
    },
    async list(prefix = "") {
      const { data, error } = await supabase.storage.from(bucket).list(prefix);
      if (error) throw new Error(`List failed: ${error.message}`);
      return (data || []).map(o => `${prefix ? prefix + "/" : ""}${o.name}`);
    },
  };
}

// ─── S3 provider stub ──────────────────────────────────
// Client-side cannot hold AWS creds safely. Real S3 ops route through
// a future /api/storage-s3 endpoint. For 2A we ship the interface so
// the rest of the system can address S3 without changing later.
function s3Provider(/* config */) {
  return {
    name: "s3",
    async upload() { throw new Error("S3 provider: not wired in 2A — coming in 2B"); },
    async getSignedUrl() { throw new Error("S3 provider: not wired in 2A"); },
    async delete() { throw new Error("S3 provider: not wired in 2A"); },
    async list()   { throw new Error("S3 provider: not wired in 2A"); },
  };
}

// ─── GCS provider stub ─────────────────────────────────
function gcsProvider(/* config */) {
  return {
    name: "gcs",
    async upload() { throw new Error("GCS provider: not wired in 2A"); },
    async getSignedUrl() { throw new Error("GCS provider: not wired in 2A"); },
    async delete() { throw new Error("GCS provider: not wired in 2A"); },
    async list()   { throw new Error("GCS provider: not wired in 2A"); },
  };
}

// ─── Resolver ───────────────────────────────────────────

const PROVIDERS = {
  stub:             () => stubProvider,
  supabase_storage: (config) => supabaseStorageProvider(config),
  s3:               (config) => s3Provider(config),
  gcs:              (config) => gcsProvider(config),
};

/**
 * Get the storage provider for a brand. Looks up the active provider config
 * via /api/provider-config, instantiates the matching implementation.
 *
 * @param {string} brand_profile_id
 * @returns {Promise<{ name, upload, getSignedUrl, delete, list }>}
 */
export async function getStorageProvider(brand_profile_id) {
  const cfg = await loadProviderConfig(brand_profile_id, "storage");
  const name = cfg?.provider_name || "stub";
  const factory = PROVIDERS[name];
  if (!factory) {
    console.warn(`Unknown storage provider "${name}" — falling back to stub`);
    return stubProvider;
  }
  try {
    return factory(cfg?.config || {});
  } catch (e) {
    console.error(`Failed to instantiate storage provider "${name}":`, e?.message);
    return stubProvider;
  }
}

export const STORAGE_PROVIDERS = Object.keys(PROVIDERS);

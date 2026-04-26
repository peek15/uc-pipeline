// ═══════════════════════════════════════════════════════════
// providers/index.js — Top-level provider registry.
// v3.10.0
//
// Re-exports every provider category for clean imports:
//   import { getStorageProvider, getVoiceProvider } from "@/lib/providers";
//
// Existing voice provider abstraction stays as-is; this module adds storage
// and the config layer.
// ═══════════════════════════════════════════════════════════

export { getStorageProvider, STORAGE_PROVIDERS } from "./storage/storage";

// Voice provider — already existed in v3.6.x. Kept here for cleanliness.
// Path may differ in your repo; adjust import if the file is at a different location.
export { getVoiceProvider } from "./voice/providers-voice";

// Config layer
export {
  loadProviderConfig,
  listProviderConfigs,
  saveProviderConfig,
  testProviderConnection,
  clearProviderCache,
} from "./config-loader";

// Provider type constants (used by Settings UI in 2B)
export const PROVIDER_TYPES = [
  { key: "voice",              label: "Voice",              providers: ["elevenlabs", "playht", "stub"] },
  { key: "storage",            label: "Storage",            providers: ["supabase_storage", "s3", "gcs", "stub"] },
  { key: "visual_atmospheric", label: "Visual (atmospheric)", providers: ["midjourney", "stub"] },
  { key: "visual_licensed",    label: "Visual (licensed)",  providers: ["shutterstock", "getty", "stub"] },
];

// Default config templates per provider — used by Settings UI to render the right fields
export const PROVIDER_DEFAULTS = {
  // Voice
  elevenlabs: {
    secrets: { api_key: "" },
    config: {
      voice_id_en: "", voice_id_fr: "", voice_id_es: "", voice_id_pt: "",
      stability: 0.5, similarity_boost: 0.75, style: 0,
    },
  },
  playht: {
    secrets: { api_key: "", user_id: "" },
    config: { voice_id_en: "", voice_id_fr: "", voice_id_es: "", voice_id_pt: "" },
  },

  // Storage
  supabase_storage: {
    secrets: {},
    config: { bucket: "", public_read: false },
  },
  s3: {
    secrets: { access_key_id: "", secret_access_key: "" },
    config:  { region: "us-east-1", bucket: "" },
  },
  gcs: {
    secrets: { service_account_json: "" },
    config:  { bucket: "" },
  },

  // Visual (placeholders — wired in 2B/D2)
  midjourney: {
    secrets: { api_key: "" },
    config:  { mode: "fast", aspect: "9:16" },
  },
  shutterstock: {
    secrets: { api_key: "", api_secret: "" },
    config:  { license_tier: "standard", editorial_allowed: false },
  },
  getty: {
    secrets: { api_key: "" },
    config:  { license_tier: "premium" },
  },

  // Stub — all providers can fall back to it for testing
  stub: { secrets: {}, config: {} },
};

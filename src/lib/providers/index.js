// ═══════════════════════════════════════════════════════════
// providers/index.js — Top-level provider registry.
// v3.11.0 — adds visual atmospheric + licensed exports.
// ═══════════════════════════════════════════════════════════

export { getStorageProvider, STORAGE_PROVIDERS } from "./storage/storage";
export { getVoiceProvider, resolveVoiceId }      from "./voice/providers-voice";
export { getAtmosphericProvider, getLicensedProvider, selectVisualProvider } from "./visual/visual";

export {
  loadProviderConfig,
  listProviderConfigs,
  saveProviderConfig,
  testProviderConnection,
  clearProviderCache,
} from "./config-loader";

// Provider type constants — used by Settings UI
export const PROVIDER_TYPES = [
  { key: "voice",              label: "Voice",                providers: ["elevenlabs", "playht", "stub"] },
  { key: "storage",            label: "Storage",              providers: ["supabase_storage", "s3", "gcs", "stub"] },
  { key: "visual_atmospheric", label: "Visual (atmospheric)", providers: ["flux", "midjourney", "dalle", "stub"] },
  { key: "visual_licensed",    label: "Visual (licensed)",    providers: ["pexels", "shutterstock", "stub"] },
];

// Default config templates per provider — Settings UI uses these to
// know what fields to render
export const PROVIDER_DEFAULTS = {
  // Voice
  elevenlabs: {
    secrets: { api_key: "" },
    config: {
      voices: [
        { lang: "en", voice_id: "" },
        { lang: "fr", voice_id: "" },
        { lang: "es", voice_id: "" },
        { lang: "pt", voice_id: "" },
      ],
      model_id:         "eleven_multilingual_v2",
      stability:        0.5,
      similarity_boost: 0.75,
      style:            0,
    },
  },
  playht: {
    secrets: { api_key: "", user_id: "" },
    config: { voices: [] },
  },

  // Storage
  supabase_storage: { secrets: {}, config: { bucket: "", public_read: false } },
  s3:               { secrets: { access_key_id: "", secret_access_key: "" }, config: { region: "us-east-1", bucket: "" } },
  gcs:              { secrets: { service_account_json: "" }, config: { bucket: "" } },

  // Visual atmospheric
  flux:        { secrets: { api_token: "" }, config: { model_id: "black-forest-labs/flux-1.1-pro", quality: 90 } },
  midjourney:  { secrets: { api_key: "" }, config: { mode: "fast", aspect: "9:16" } },
  dalle:       { secrets: { api_key: "" }, config: { model: "dall-e-3", size: "1024x1792" } },

  // Visual licensed
  pexels:       { secrets: { api_key: "" }, config: {} },
  shutterstock: { secrets: { api_key: "", api_secret: "" }, config: { license_tier: "standard", editorial_allowed: false } },

  stub: { secrets: {}, config: {} },
};

import { DATA_CLASSES, DEFAULT_PRIVACY_MODE, canSendToProvider, normalizeDataClass, normalizePrivacyMode } from "./privacyTypes";

const D0_D1 = [DATA_CLASSES.D0_PUBLIC, DATA_CLASSES.D1_BUSINESS_STANDARD];
const D0_TO_D3 = [DATA_CLASSES.D0_PUBLIC, DATA_CLASSES.D1_BUSINESS_STANDARD, DATA_CLASSES.D2_CONFIDENTIAL, DATA_CLASSES.D3_SENSITIVE];
const BLOCK_SECRET = [DATA_CLASSES.D4_SECRET];

export const PROVIDER_PRIVACY_PROFILES = {
  anthropic_standard: profile({
    provider_type: "llm",
    display_name: "Anthropic standard",
    no_training_default: true,
    standard_retention: "limited_retention",
    zero_retention_available: "configurable",
    allowed_data_classes: D0_D1,
    enhanced_privacy_allowed: false,
    notes: "Standard commercial API profile. Treat retention as limited unless ZDR contract/config is confirmed.",
  }),
  anthropic_zdr_placeholder: profile({
    provider_type: "llm",
    display_name: "Anthropic ZDR placeholder",
    no_training_default: true,
    standard_retention: "no_retention",
    zero_retention_available: true,
    zero_retention_enabled: false,
    allowed_data_classes: D0_TO_D3,
    enhanced_privacy_allowed: false,
    enterprise_allowed: true,
    notes: "Placeholder only. Must be enabled after contract and tenant routing are verified.",
  }),
  openai_standard: profile({
    provider_type: "llm",
    display_name: "OpenAI standard",
    no_training_default: true,
    standard_retention: "limited_retention",
    zero_retention_available: "configurable",
    allowed_data_classes: D0_D1,
    enhanced_privacy_allowed: false,
    notes: "Standard API profile. Do not route D2/D3 without approved no-retention configuration.",
  }),
  openai_zdr_placeholder: profile({
    provider_type: "llm",
    display_name: "OpenAI ZDR placeholder",
    no_training_default: true,
    standard_retention: "no_retention",
    zero_retention_available: true,
    zero_retention_enabled: false,
    allowed_data_classes: D0_TO_D3,
    enhanced_privacy_allowed: false,
    enterprise_allowed: true,
    notes: "Placeholder only. Requires account-level validation before use.",
  }),
  google_vertex_zdr_placeholder: profile({ provider_type: "llm", display_name: "Google Vertex ZDR placeholder", standard_retention: "unknown", allowed_data_classes: D0_D1, enterprise_allowed: true, notes: "Conservative placeholder pending provider validation." }),
  aws_bedrock_placeholder: profile({ provider_type: "llm", display_name: "AWS Bedrock placeholder", standard_retention: "unknown", allowed_data_classes: D0_D1, enterprise_allowed: true, notes: "Conservative placeholder pending provider validation." }),
  elevenlabs_standard: profile({ provider_type: "voice", display_name: "ElevenLabs standard", standard_retention: "provider_policy", allowed_data_classes: D0_D1, notes: "Do not process sensitive voice, likeness, or personal data without stricter routing and consent." }),
  elevenlabs_zero_retention_placeholder: profile({ provider_type: "voice", display_name: "ElevenLabs zero-retention placeholder", standard_retention: "no_retention", zero_retention_available: true, zero_retention_enabled: false, allowed_data_classes: D0_TO_D3, enterprise_allowed: true, notes: "Placeholder; requires contractual validation and explicit enablement." }),
  replicate_standard: profile({ provider_type: "visual", display_name: "Replicate standard", standard_retention: "provider_policy", allowed_data_classes: D0_D1, notes: "Visual prompt provider. Do not send confidential launch plans or personal data." }),
  pexels_standard: profile({ provider_type: "visual", display_name: "Pexels", no_training_default: "unknown", standard_retention: "provider_policy", allowed_data_classes: D0_D1, notes: "Licensed/public media search. Queries should be minimized." }),
  supabase_storage: profile({ provider_type: "storage", display_name: "Supabase Storage", no_training_default: true, standard_retention: "provider_policy", zero_retention_available: false, allowed_data_classes: D0_TO_D3, enhanced_privacy_allowed: true, enterprise_allowed: true, supports_client_owned_storage: false, notes: "Primary storage in this repo; RLS and signed URLs are required." }),
  client_owned_storage_placeholder: profile({ provider_type: "storage", display_name: "Client-owned storage placeholder", no_training_default: true, standard_retention: "no_retention", allowed_data_classes: D0_TO_D3, enhanced_privacy_allowed: true, enterprise_allowed: true, supports_client_owned_storage: true, notes: "Future enterprise storage route." }),
  vercel: profile({ provider_type: "other", display_name: "Vercel", standard_retention: "provider_policy", allowed_data_classes: D0_D1, enhanced_privacy_allowed: true, enterprise_allowed: true, notes: "App hosting and runtime logs; raw logs must remain sanitized." }),
  sentry: profile({ provider_type: "monitoring", display_name: "Sentry", standard_retention: "provider_policy", allowed_data_classes: D0_D1, requires_client_disclosure: true, notes: "Monitoring only. Do not send raw prompts, secrets, or client documents." }),
  posthog: profile({ provider_type: "analytics", display_name: "PostHog", standard_retention: "provider_policy", allowed_data_classes: D0_D1, requires_client_disclosure: true, notes: "Product analytics only; avoid client content." }),
  resend: profile({ provider_type: "email", display_name: "Resend", standard_retention: "provider_policy", allowed_data_classes: D0_D1, requires_client_disclosure: true, notes: "Transactional email." }),
  stripe: profile({ provider_type: "other", display_name: "Stripe", standard_retention: "provider_policy", allowed_data_classes: D0_D1, requires_client_disclosure: true, notes: "Billing data only." }),
  trigger_dev: profile({ provider_type: "other", display_name: "Trigger.dev", standard_retention: "provider_policy", allowed_data_classes: D0_D1, requires_client_disclosure: true, notes: "Job orchestration; payloads must be minimized." }),
  n8n_cloud: profile({ provider_type: "other", display_name: "n8n Cloud", standard_retention: "unknown", allowed_data_classes: D0_D1, requires_client_disclosure: true, notes: "Conservative placeholder." }),
};

export const PROVIDER_KEY_ALIASES = {
  anthropic: "anthropic_standard",
  openai: "openai_standard",
  claude: "anthropic_standard",
  elevenlabs: "elevenlabs_standard",
  flux: "replicate_standard",
  replicate: "replicate_standard",
  pexels: "pexels_standard",
  supabase: "supabase_storage",
  supabase_storage: "supabase_storage",
  stub: "client_owned_storage_placeholder",
};

export function getProviderPrivacyProfile(providerKey) {
  const key = PROVIDER_KEY_ALIASES[providerKey] || providerKey;
  return PROVIDER_PRIVACY_PROFILES[key] || null;
}

export function assertProviderAllowedForData({ providerKey, dataClass, privacyMode = DEFAULT_PRIVACY_MODE, operationType = "provider_call" }) {
  const profile = getProviderPrivacyProfile(providerKey);
  if (!profile) {
    const error = new Error(`Provider privacy profile missing for ${providerKey}`);
    error.code = "PROVIDER_PRIVACY_PROFILE_MISSING";
    throw error;
  }
  const result = canSendToProvider({
    dataClass: normalizeDataClass(dataClass),
    privacyMode: normalizePrivacyMode(privacyMode),
    providerProfile: profile,
  });
  if (!result.allowed) {
    const error = new Error(`${operationType}: ${result.reason}`);
    error.code = "PROVIDER_PRIVACY_BLOCKED";
    error.providerProfile = profile.provider_key;
    throw error;
  }
  return profile;
}

function profile(overrides) {
  return {
    provider_key: null,
    provider_type: "other",
    display_name: "Unknown provider",
    no_training_default: "unknown",
    standard_retention: "unknown",
    zero_retention_available: "unknown",
    zero_retention_enabled: false,
    allowed_data_classes: D0_D1,
    blocked_data_classes: BLOCK_SECRET,
    enhanced_privacy_allowed: false,
    enterprise_allowed: false,
    requires_client_disclosure: true,
    supports_client_owned_credentials: false,
    supports_client_owned_storage: false,
    notes: "",
    blocked_features_for_privacy: [],
    ...overrides,
  };
}

for (const key of Object.keys(PROVIDER_PRIVACY_PROFILES)) {
  PROVIDER_PRIVACY_PROFILES[key].provider_key = key;
}

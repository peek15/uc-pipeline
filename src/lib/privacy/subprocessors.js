import { PROVIDER_PRIVACY_PROFILES } from "./providerPrivacyProfiles";
import { PRIVACY_MODES } from "./privacyTypes";

export const SUBPROCESSORS = [
  entry("Supabase", "Database/storage/auth", "Primary app database, auth, storage", "Workspace content, metadata, uploads, auth identifiers", true, true, true, "provider_policy", "supabase_storage"),
  entry("Vercel", "Hosting", "Application hosting and serverless runtime", "Requests, sanitized logs, operational metadata", true, false, true, "provider_policy", "vercel"),
  entry("Stripe", "Billing", "Payments, billing portal, invoices", "Billing identity, plan metadata, payment records", true, false, true, "provider_policy", "stripe"),
  entry("Resend", "Email", "Transactional email", "Email address and transactional content", true, false, false, "provider_policy", "resend"),
  entry("Sentry", "Monitoring", "Error monitoring", "Sanitized errors and operational metadata", true, false, false, "provider_policy", "sentry"),
  entry("PostHog", "Analytics", "Product analytics", "Usage events and identifiers", true, false, false, "provider_policy", "posthog"),
  entry("Trigger.dev", "Jobs", "Long-running production job orchestration", "Minimized job metadata", true, false, false, "provider_policy", "trigger_dev"),
  entry("n8n Cloud", "Automation", "Workflow automation placeholder", "TBD minimized workflow data", true, false, false, "unknown", "n8n_cloud"),
  entry("OpenAI", "AI provider", "LLM inference", "Prompts and context during inference", true, true, false, "limited_retention", "openai_standard"),
  entry("Anthropic", "AI provider", "LLM inference", "Prompts and context during inference", true, true, false, "limited_retention", "anthropic_standard"),
  entry("Google/Vertex/Gemini", "AI provider", "Future LLM inference", "TBD", true, true, false, "unknown", "google_vertex_zdr_placeholder"),
  entry("AWS Bedrock", "AI provider", "Future LLM inference", "TBD", true, true, false, "unknown", "aws_bedrock_placeholder"),
  entry("ElevenLabs", "Voice", "Voice generation", "Script text, voice settings, potential voice/likeness data", true, true, false, "provider_policy", "elevenlabs_standard"),
  entry("Replicate", "Visual AI", "Image generation", "Visual prompts and operational metadata", false, true, false, "provider_policy", "replicate_standard"),
  entry("Pexels", "Licensed media", "Stock media search", "Search query and result metadata", false, false, false, "provider_policy", "pexels_standard"),
  entry("Documenso", "Documents", "Future document signing", "TBD", true, true, false, "unknown", null),
  entry("Tally", "Forms", "Future intake forms", "TBD", true, true, false, "unknown", null),
  entry("Cal.com", "Scheduling", "Future scheduling", "Names, emails, booking metadata", true, false, false, "unknown", null),
  entry("Airtable", "Ops database", "Legacy/internal sync", "Content metadata where configured", true, true, false, "unknown", null),
];

export function providerTransparencyRows() {
  return SUBPROCESSORS.map(row => {
    const profile = row.provider_profile_key ? PROVIDER_PRIVACY_PROFILES[row.provider_profile_key] : null;
    return {
      ...row,
      no_training_status: profile?.no_training_default ?? "unknown",
      enhanced_privacy_compatible: !!profile?.enhanced_privacy_allowed,
      privacy_modes: profile?.enhanced_privacy_allowed
        ? [PRIVACY_MODES.STANDARD, PRIVACY_MODES.CONFIDENTIAL, PRIVACY_MODES.ENHANCED_PRIVACY]
        : [PRIVACY_MODES.STANDARD],
    };
  });
}

function entry(name, category, purpose, data_processed, personal_data_possible, client_confidential_data_possible, default_enabled, retention_profile, provider_profile_key) {
  return {
    name,
    category,
    purpose,
    data_processed,
    personal_data_possible,
    client_confidential_data_possible,
    default_enabled,
    privacy_mode_compatibility: "Conservative; see provider profile before routing confidential/sensitive data.",
    retention_profile,
    no_training_statement: "TBD / provider-specific. Do not present as an absolute guarantee until legal/provider validation.",
    notes: "Internal registry entry for future legal/security review.",
    provider_profile_key,
  };
}

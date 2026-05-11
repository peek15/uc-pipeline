# Provider Privacy Profiles — Internal

**Source of truth:** `src/lib/privacy/providerPrivacyProfiles.js`

## Core Rules
- D4 secrets are blocked from AI/media providers.
- D2/D3 are blocked from standard/unknown-retention AI/media profiles.
- Unknown retention is never treated as safe for confidential/sensitive data.
- Placeholder ZDR profiles are conservative and disabled until contracts/routing are verified.

## Initial Profiles
- `anthropic_standard` — D0/D1 only, limited retention assumed.
- `anthropic_zdr_placeholder` — D0-D3 shape exists, not Enhanced Privacy enabled until validated.
- `openai_standard` — D0/D1 only, limited retention assumed.
- `openai_zdr_placeholder` — D0-D3 shape exists, not Enhanced Privacy enabled until validated.
- `google_vertex_zdr_placeholder` — D0/D1 only until validated.
- `aws_bedrock_placeholder` — D0/D1 only until validated.
- `elevenlabs_standard` — D0/D1 only; likeness/sensitive voice requires stricter policy.
- `elevenlabs_zero_retention_placeholder` — placeholder only.
- `replicate_standard` — D0/D1 only.
- `pexels_standard` — D0/D1 search queries only.
- `supabase_storage` — D0-D3 storage with RLS/signed URLs; Enhanced compatible as storage, not AI.
- `client_owned_storage_placeholder` — future enterprise path.
- `vercel`, `sentry`, `posthog`, `resend`, `stripe`, `trigger_dev`, `n8n_cloud` — operational/subprocessor profiles.

## Requires Validation
- Provider DPAs.
- No-training defaults.
- No-retention/ZDR contract availability.
- Whether workspace-specific ZDR settings are actually active.
- Client-owned credential support.
- Client-owned storage support.
- Regional processing and retention details.

## Blocked Features For Privacy
Until validated:
- Full document sending to AI providers.
- D2/D3 routing to standard LLM/media providers.
- Voice cloning or likeness workflows without consent and stricter routing.
- Provider debug logs containing raw request/response payloads.

# Sprint 7 Privacy / Data Protection Run Summary

**Version:** 3.28.0  
**Date:** 2026-05-11

## What Changed
- Added central data classes and privacy modes.
- Added conservative provider privacy profiles.
- Added AI Privacy Gateway skeleton and prompt minimization pipeline.
- Added privacy-safe logging helpers.
- Wired `/api/agent` and `/api/claude` through privacy checks/minimization.
- Hardened `/api/provider-call` with workspace authorization, provider privacy checks, minimization, and sanitized errors.
- Reworked `/api/provider-config` authorization to workspace owner/admin instead of domain gate.
- Added onboarding source classification/chunk metadata.
- Added Settings → Privacy & Data Handling.
- Added privacy settings, export, delete-request, and retention-summary API scaffolds.
- Added Sprint 7 SQL migration and internal privacy documentation pack.

## Files Modified / Added
- `src/lib/privacy/*`
- `src/app/api/privacy/*`
- `src/app/api/agent/route.js`
- `src/app/api/claude/route.js`
- `src/app/api/provider-call/route.js`
- `src/app/api/provider-config/route.js`
- `src/app/api/onboarding/source/route.js`
- `src/components/SettingsModal.jsx`
- `src/app/page.js`
- `src/lib/ai/audit.js`
- `supabase-sprint7-privacy-data.sql`
- `PRIVACY_ARCHITECTURE_INTERNAL.md`
- `DATA_RETENTION_POLICY_INTERNAL.md`
- `SUBPROCESSORS_INTERNAL.md`
- `PROVIDER_PRIVACY_PROFILES_INTERNAL.md`
- `PRIVACY_TEST_PLAN.md`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

## DB Migration Added
`supabase-sprint7-privacy-data.sql` adds:
- `workspaces.privacy_mode`
- `brand_profiles.default_data_class`
- privacy metadata fields on `ai_calls` and `cost_events`
- lifecycle fields on relevant content/asset/source tables
- `source_documents`
- `document_chunks`
- `privacy_requests`
- RLS for new privacy/source tables

## Privacy-Aware Routes
- `/api/agent`
- `/api/claude`
- `/api/provider-call`
- `/api/provider-config`
- `/api/onboarding/source`
- `/api/privacy/settings`
- `/api/privacy/export`
- `/api/privacy/delete-request`
- `/api/privacy/retention-summary`

## Provider Assumptions
Standard Anthropic/OpenAI/ElevenLabs/Replicate/Pexels profiles allow D0/D1 only. Placeholder ZDR/no-retention profiles exist but are not treated as enabled until contract/routing validation.

## Data Class Blocking
- D4 is blocked from AI/media providers.
- D2/D3 are blocked from standard/unknown-retention providers.
- Enhanced Privacy requires approved no-retention/client-owned routing for D2/D3.

## Remaining Known Risks
- Legacy client-side AI runner still calls `/api/claude`; route is privacy-checked, but tenant context is sometimes defaulted until callers pass workspace/brand explicitly.
- Full archive export generation is not implemented.
- Destructive deletion jobs are not implemented.
- PDF/image extraction remains pending.
- Provider ZDR profiles require contract and runtime validation.
- No automated test harness exists in the repo yet.

## Requires Legal / Provider Review
- Public privacy copy.
- Subprocessor list.
- DPAs and no-training/no-retention terms.
- Regional processing/retention commitments.
- Enhanced Privacy commercial terms.

## Enterprise Privacy Remaining
- Client-owned credentials.
- Client-owned storage.
- Verified ZDR routing.
- Per-workspace provider routing policies.
- Stronger document extraction, chunk review, and approved snippet sending.
- Legal hold and deletion job orchestration.

## Validation
- `npm run build` passed.
- `npm run lint --if-present` completed; no lint script is defined in `package.json`.

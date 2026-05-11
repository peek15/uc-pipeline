# Commercial Hardening Sprint 7 — Privacy / Data Protection Foundation

**Version:** 3.28.0  
**Date:** 2026-05-11

## Scope
Sprint 7 implements the Minimum Viable Privacy Run: classification, privacy modes, provider privacy profiles, AI privacy gateway skeleton, no-raw-log helpers, prompt minimization, onboarding/upload intake hardening, Settings privacy UI, retention/export/delete scaffolds, subprocessor registry, and documentation.

## Implementation Summary
- Centralized `DATA_CLASSES` and `PRIVACY_MODES`.
- Added conservative provider privacy registry and provider transparency data.
- Added prompt minimization/redaction and payload hashing.
- Added privacy-safe logging helpers.
- Wired `/api/agent`, `/api/claude`, and `/api/provider-call` through privacy checks.
- Added workspace owner/admin server route for privacy settings.
- Added request-only export and deletion scaffolds.
- Added onboarding source data classification and chunk/snippet metadata.
- Added migration `supabase-sprint7-privacy-data.sql`.

## Validation
- `npm run build` passed.
- `npm run lint --if-present` completed; no lint script is defined.
- See `PRIVACY_DATA_RUN_SUMMARY.md` for route coverage, provider assumptions, blocking rules, known risks, and legal/provider review needs.
- See `PRIVACY_TEST_PLAN.md` for manual regression tests.

## Intentionally Deferred
- Public legal/privacy copy.
- Verified ZDR contracts and runtime enablement.
- Destructive deletion jobs.
- Full export archive generation.
- Full PDF/image extraction.
- Enterprise client-owned credential/storage routing.

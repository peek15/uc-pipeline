# Onboarding Agent Final Hardening Notes
**Date:** 2026-05-13  
**Version:** 3.40.0  
**Scope:** Final non-UI onboarding agent hardening pass.

## What Changed
- Research jobs now support both queued creation and explicit processing.
- `/api/onboarding/research-job` supports:
  - `action: "run"` for inline execution
  - `action: "enqueue"` for queued job creation
  - `action: "process"` for processing queued/retrying/partial jobs
- Added `src/lib/onboardingOcrProvider.js`.
- `/api/onboarding/ocr` now exposes OCR provider status through `GET`.
- Runtime eval support was added to `npm run eval:onboarding` through environment variables.

## Runtime Eval Mode
Static checks always run. Live checks run only when these are set:

```bash
ONBOARDING_EVAL_BASE_URL=http://localhost:3000 \
ONBOARDING_EVAL_TOKEN=... \
ONBOARDING_EVAL_WORKSPACE_ID=... \
ONBOARDING_EVAL_BRAND_PROFILE_ID=... \
ONBOARDING_EVAL_SESSION_ID=... \
npm run eval:onboarding
```

Live eval currently checks:
- company-name-only input is accepted as a working brand signal
- weak input does not trigger premature drafting

## Research Jobs
The model is now ready for a real worker:
- enqueue jobs
- process queued jobs
- persist attempts/results when the Supabase migration is applied

The current process endpoint is still request-driven. A true external worker/cron is not added.

## OCR
OCR provider status is explicit:
- provider: `none`
- configured: `false`
- text PDF support: yes, through lightweight extraction
- image/scanned PDF OCR: unavailable

This keeps the system honest until a real OCR/vision provider is approved.

## Remaining Non-UI Work
- Add a real worker/cron that calls `action: "process"` automatically.
- Add a real OCR/vision provider after privacy/provider routing is approved.
- Expand live eval cases with real Supabase fixtures and CI secrets.
- Run 5-10 real-brand dry runs and tune planner/critic thresholds.

## Validation
- `npm run eval:onboarding`: passed
- `npm run lint --if-present`: passed
- `npm run build`: passed

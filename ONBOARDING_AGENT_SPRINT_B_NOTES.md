# Onboarding Agent Sprint B Notes
**Date:** 2026-05-13  
**Version:** 3.38.0  
**Scope:** Background-style research jobs, retries, partial results, and OCR-ready document handling.

## What Changed
- Added `src/lib/onboardingResearchJobs.js`.
- Added `/api/onboarding/research-job`.
- Added `/api/onboarding/ocr`.
- Added `supabase-sprint10-onboarding-research-jobs.sql`.
- Routed onboarding agent source research through retryable research jobs.
- Added research-attempt WorkTrace rows inside onboarding.
- Added OCR status metadata for uploaded files.

## Research Jobs
Research jobs support:
- `company_research`
- `website_research`
- status: `queued`, `running`, `retrying`, `partial`, `completed`, `failed`, `cancelled`
- attempts
- partial result metadata
- error message
- result JSON

The current implementation runs inside the request for V1, but persists job state when the migration is applied. This creates the correct model for a later real worker/queue without adding Vercel Workflow or another provider yet.

## API Routes
### `/api/onboarding/research-job`
- `GET`: list latest jobs for a workspace/session.
- `POST`: run a retryable company/website research job.
- Requires authenticated workspace membership.
- Verifies onboarding session belongs to workspace.

### `/api/onboarding/ocr`
- Reuses stored source text or lightweight PDF text if available.
- Updates source intelligence when analyzable text exists.
- Returns `requires_ocr` for scanned PDFs/images instead of pretending analysis happened.
- Requires authenticated workspace membership.

## Document/OCR Handling
- Text/markdown: parsed.
- Readable PDFs: lightweight text extraction attempted.
- Scanned PDFs/images: marked `requires_ocr`.
- No full OCR provider was added.
- No image understanding is claimed.

## Migration
Apply:

```sql
supabase-sprint10-onboarding-research-jobs.sql
```

Without the migration, the agent still researches, but persisted research job state is unavailable.

## What Is Intentionally Not Implemented
- Real background worker/queue.
- Vercel Workflow integration.
- OCR provider integration.
- Full scanned PDF/image analysis.
- Broad market intelligence, competitor scan, or social scan.

## Validation
- `npm run eval:onboarding`: passed
- `npm run lint --if-present`: passed
- `npm run build`: passed

# Document OCR Jobs Sprint

## A. Files Changed
- `src/lib/intelligenceJobs.js`
- `src/app/api/onboarding/source/route.js`
- `scripts/intelligence-jobs-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Move OCR/document extraction attempts into the generic intelligence job system so PDF/image sources have a durable processing lifecycle instead of a static pending label.

## C. Job Processor
`src/lib/intelligenceJobs.js` now includes an `ocr_extraction` processor.

The processor:
- loads the target `onboarding_sources` row
- marks OCR job metadata as running
- calls `runOnboardingOcr`
- updates source metadata with OCR status, provider status, gateway metadata, and limitations
- stores extracted text/source intelligence when OCR succeeds

## D. Source Intake
`/api/onboarding/source` now enqueues an `ocr_extraction` job for PDF/image sources that are not analyzed during initial intake.

Returned payload now includes:
- `sources`
- `ocr_jobs`

## E. Data Storage
No new SQL migration is required. This sprint uses:
- `intelligence_jobs`
- `onboarding_sources.metadata_json`

Raw base64 image/audio payloads are explicitly stripped from queued job input.

## F. Current Behavior
Works now:
- durable OCR job lifecycle
- OCR job queueing from onboarding source intake
- source metadata updates from OCR processing
- text/readable-PDF reuse through existing OCR helper
- image OCR when transient image data is available synchronously and OpenAI is configured

Still honest limitations:
- queued OCR jobs cannot process raw images unless a durable file reference/storage path exists
- scanned PDF rendering to images is not implemented
- multi-page OCR batching is modeled but not implemented
- layout/table extraction is not implemented

## G. Why No SQL Migration
The previously applied `intelligence_jobs` migration already includes:
- `ocr_extraction` job type
- input/result/metadata JSON
- status/attempt fields
- workspace RLS

This sprint only wires code to that existing schema.

## H. Validation
Results:
- `npm run eval:intelligence` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## I. Remaining Risks
- A real durable file storage path is needed for async image OCR.
- Scanned PDFs still need server-safe PDF rendering or a document OCR vendor.
- Job processing is API-triggered, not background cron/queue worker yet.

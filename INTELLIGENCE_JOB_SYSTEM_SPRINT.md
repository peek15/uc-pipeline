# Intelligence Job System Sprint

## A. Files Changed
- `supabase-sprint11-intelligence-jobs.sql`
- `src/lib/intelligenceJobs.js`
- `src/app/api/intelligence-jobs/route.js`
- `scripts/intelligence-jobs-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Add the first generic worker/job foundation so slow intelligence work can move out of synchronous request paths over time.

## C. Data Model
New migration:
- `supabase-sprint11-intelligence-jobs.sql`

New table:
- `intelligence_jobs`

Core fields:
- workspace/brand/session scope
- job type
- status
- priority
- input/result/metadata JSON
- attempts/max attempts
- lock fields
- started/completed timestamps
- created user

RLS:
- workspace members can read/create/update jobs for their workspace.
- service role can process jobs.

## D. Library
New helper:
- `src/lib/intelligenceJobs.js`

Exports:
- `enqueueIntelligenceJob`
- `listIntelligenceJobs`
- `processIntelligenceJobs`

The first implemented processor delegates `onboarding_research` jobs to the existing onboarding research processor.

## E. API
New route:
- `/api/intelligence-jobs`

Supported:
- `GET` list jobs by workspace/session/status.
- `POST { action: "enqueue" }` enqueue a job.
- `POST { action: "process" }` process queued jobs for a workspace/session.

All requests require authentication and workspace membership.

## F. Current Job Types
Allowed job types:
- `onboarding_research`
- `document_extraction`
- `ocr_extraction`
- `gateway_eval`
- `provider_task`
- `generic`

Only `onboarding_research` has an active processor in this sprint.

## G. What Is Intentionally Not Implemented
- No external worker provider.
- No cron schedule.
- No Trigger.dev/Vercel Queues integration.
- No dashboard UI.
- No background processing without an explicit API call.
- No OCR provider execution.
- No destructive delete job processor.

## H. Validation
Results:
- `npm run eval:intelligence` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## I. Remaining Risks
- The migration must be applied before persistence is live.
- Processing is still API-triggered and not durable background infrastructure yet.
- Claim/lock behavior is lightweight and not transactional enough for high concurrency.
- Only onboarding research jobs are actually processed in this sprint.

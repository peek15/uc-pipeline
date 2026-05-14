# Workspace Intelligence Memory Sprint

## A. Files Changed
- `src/lib/workspaceMemory.js`
- `src/app/api/workspace-memory/route.js`
- `src/app/api/onboarding/approve/route.js`
- `src/lib/onboardingAgentStep.js`
- `scripts/workspace-memory-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Add Workspace Intelligence Memory V1 so Creative Engine can persist approved strategic learnings and retrieve them into future onboarding/strategy conversations.

## C. Storage Decision
No new SQL migration is required.

V1 uses the existing `intelligence_insights` table:
- `category = memory`
- `source = workspace_memory`
- `status = applied`, `reviewed`, or `open`

This avoids creating a second memory table before the product has a UI for memory review.

## D. Memory Written
On onboarding approval, Creative Engine now writes durable memory items for:
- Brand Profile
- Content Strategy
- Programmes
- Risk / Claims Guidance

Memory includes:
- summary
- confidence
- workspace ID
- brand profile ID
- approved session
- approver
- source citations/assumptions when available

## E. Memory Retrieved
`buildOnboardingAgentStep` now retrieves workspace/brand memory and includes it in the onboarding prompt as “Durable workspace memory.”

This lets refreshed onboarding avoid forgetting approved facts and user-confirmed strategy.

## F. API
New route:
- `/api/workspace-memory`

Supported:
- `GET` memory for workspace/brand
- `POST` write reviewed/manual memory items

All requests require authentication and workspace membership.

## G. Evals
New eval:
- `scripts/workspace-memory-eval.mjs`

Combined intelligence eval now includes:
- `npm run eval:memory`

## H. OCR Deferred Work
Deferred OCR/document lane work remains tracked:
- durable file storage/file refs for async image OCR
- scanned PDF rendering
- multi-page OCR batching
- layout/table extraction
- background worker/cron processing

## I. What Is Intentionally Not Implemented
- No memory UI yet.
- No embeddings/vector search.
- No automatic mutation of strategy from memory.
- No memory decay/confidence recalculation.
- No delete/review workflow beyond existing insight statuses.

## J. Validation
Results:
- `npm run eval:intelligence` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## K. Remaining Risks
- Memory retrieval is keyword/category based, not semantic.
- Duplicate memory can accumulate until a review/compaction workflow exists.
- Memory is only fed into onboarding in this sprint; Create/Strategy assistant retrieval should follow.

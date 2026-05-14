# Intelligence Trust Sprint

**Version:** 3.53.0  
**Date:** 2026-05-14

## A. Files Changed
- `src/lib/workspaceMemory.js`
- `src/lib/ai/runner.js`
- `src/app/api/agent/route.js`
- `src/lib/privacy/dataLifecycle.js`
- `scripts/workspace-memory-eval.mjs`
- `scripts/intelligence-runtime-eval.mjs`
- `evals/intelligence-runtime-scenarios.json`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`
- `package.json`
- `package-lock.json`
- `src/app/page.js`

## B. Memory Hardening
- Workspace memory retrieval now widens the candidate pool before selecting final prompt memory.
- Selection uses effective confidence based on base confidence, status, recency decay, and source grouping.
- Retrieval dedupes near-identical memory and caps prompt-visible memory.
- Inactive memory remains excluded because retrieval only accepts `open`, `reviewed`, and `applied` rows.
- Returned payload now includes `source_groups` and `memory_context` for reviewable metadata.

## C. Used-Memory Metadata
- Runner-based AI calls and `/api/agent` now record safe memory-use metadata when durable memory is injected.
- Logged fields are limited to used flag, count, memory IDs, and source groups.
- Raw memory rows, raw source documents, raw prompts, and provider payloads are not added to logs.

## D. Runtime Eval Coverage
- Runtime eval scenarios now include governed `/api/workspace-memory` retrieval.
- The runtime eval runner supports GET/HEAD scenarios and path placeholder substitution.
- Workspace memory eval checks now cover hardening, memory metadata, and privacy manifest coverage.

## E. Privacy Manifest Coverage
- Privacy export/delete scaffolds now include intelligence-layer tables:
  - `onboarding_agent_memory`
  - `onboarding_research_jobs`
  - `intelligence_insights`
  - `intelligence_jobs`
  - `performance_snapshots`
  - `agent_feedback`
  - `privacy_requests`

## F. SQL / Migration
- No new SQL migration was added in this sprint.
- The sprint uses existing memory, intelligence job, privacy request, feedback, and performance tables.

## G. What Was Intentionally Not Implemented
- No vector/embedding memory retrieval.
- No automatic memory compaction job.
- No new memory table.
- No scoring, generation, ranking, approval, export, or strategy mutation from memory.
- No new provider routing or billing behavior.
- No new UI redesign.

## H. Validation
- `npm run eval:intelligence`: passed.
- `npm run lint --if-present`: passed.
- `npm run build`: passed.

## I. Manual Test Checklist
- Memory API returns workspace-scoped `memories`, `summary`, `source_groups`, and `memory_context`.
- Archived/wrong memory is excluded from retrieved context.
- Assistant prompts include durable memory only after workspace membership verification.
- AI logs show memory metadata without raw memory payloads.
- Privacy export/delete manifests include intelligence and memory tables.
- Existing onboarding, Strategy, Ideas, Pipeline, Create, Calendar, Analyze, Settings, privacy, compliance, approval, and export surfaces still load.

## J. Remaining Risks
- Retrieval is still lexical/rule-scored, not semantic.
- Memory compaction is not automated.
- Optional live evals require environment variables and authenticated test workspace data.
- Privacy export/delete routes remain manifest scaffolds; destructive deletion still requires a reviewed job.

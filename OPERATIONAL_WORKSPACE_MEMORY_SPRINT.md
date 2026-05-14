# Operational Workspace Memory Sprint
**Date:** 2026-05-13
**Version:** 3.51.0

## A. Files Changed
- `src/lib/ai/runner.js`
- `src/app/api/agent/route.js`
- `src/lib/ai/prompts/research-stories.js`
- `src/lib/ai/prompts/score-story.js`
- `src/lib/ai/prompts/reach-score.js`
- `src/lib/ai/prompts/generate-script.js`
- `src/lib/ai/prompts/translate-script.js`
- `src/components/ResearchView.jsx`
- `src/components/CreateView.jsx`
- `src/app/page.js`
- `scripts/workspace-memory-eval.mjs`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`
- `package.json`
- `package-lock.json`

## B. Goal
Workspace memory was previously strongest in onboarding. This sprint extends it into operational AI behavior so Creative Engine can use approved strategy memory, repeated corrections, programme intent, and risk patterns when generating, scoring, translating, and assisting.

## C. Memory Retrieval
`src/lib/ai/runner.js` now has a memory-aware prompt path. When a call includes `workspace_id` and, ideally, `brand_profile_id`, the runner retrieves `/api/workspace-memory` and injects the summary into supported prompt builders.

Supported V1 prompt types:
- `research-stories`
- `score-story`
- `generate-script`
- `translate-script`
- `reach-score`
- `agent-call`

If memory is unavailable, calls continue without failing.

## D. Assistant Integration
`/api/agent` now retrieves durable workspace memory server-side after workspace membership verification and appends it to the system context.

The assistant is instructed to treat memory as advisory:
- current user instructions outrank memory
- current screen/content context outranks memory
- memory is not a live external source

## E. Ideas / Research Integration
Research generation and scoring now pass workspace/brand context into the runner. The ideation and scoring prompts can use durable memory for approved positioning, audience preferences, programme intent, repeated corrections, and known risk patterns.

## F. Create Integration
Create draft generation and translations now pass workspace/brand context so scripts and translated copy can use durable memory for voice, positioning, corrections, and risk awareness.

## G. What Was Intentionally Not Changed
- No new SQL migration.
- No embeddings or vector search.
- No automatic strategy mutation from memory.
- No automatic content mutation outside explicit generation/edit actions.
- No memory review UI yet.
- No performance-learning model yet.

## H. Validation
Run:
- `npm run eval:intelligence`
- `npm run lint --if-present`
- `npm run build`

## I. Remaining Risks
- Memory retrieval is summary-based and recency/confidence sorted, not semantic.
- Memory review/approval UI is still limited to existing insight review areas.
- Prompt-level memory improves behavior, but it is not a full agent planning/memory system yet.

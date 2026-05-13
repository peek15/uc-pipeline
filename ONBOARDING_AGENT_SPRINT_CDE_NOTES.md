# Onboarding Agent Sprint C/D/E Notes
**Date:** 2026-05-13  
**Version:** 3.39.0  
**Scope:** Strategy critic, durable brand memory, refresh diff, runtime-eval scaffolding, and guardrails.

## What Changed
- Added `src/lib/onboardingStrategyCritic.js`.
- Added `src/lib/onboardingBrandMemory.js`.
- Added `src/lib/onboardingGuardrails.js`.
- Wired draft quality review into `/api/onboarding/analyze`.
- Wired durable brand memory and strategy refresh diff into `/api/onboarding/approve`.
- Expanded `npm run eval:onboarding` with critic/memory/guardrail contract checks.
- Onboarding draft cards now show a deterministic strategy quality review.

## Strategy Critic
The critic checks for:
- generic brand description
- missing priority offer
- missing priority audience
- duplicate or incomplete programmes
- unsupported/high-risk claims language
- missing citations for important inferred fields
- planner draft blockers

It produces:
- score
- status
- issues
- improvements
- assumptions

This is deterministic and not legal advice.

## Durable Brand Memory
On approval, Creative Engine now stores durable onboarding memory in brand settings:
- confirmed facts
- source citations
- assumptions
- quality review
- approved session/user/timestamp

It also stores a `last_refresh_diff` comparing previous settings to the newly approved settings.

## Guardrails
V1 limits now exist for:
- max agent turns per session
- max research jobs per session
- max sources per session

These are conservative product guardrails, not billing features.

## Eval
`npm run eval:onboarding` now checks:
- planner contract
- source citation contract
- unsure-default behavior
- PDF/image honesty
- draft quality review wiring
- durable brand memory wiring
- onboarding guardrail wiring

This is still a static contract runner, not a live LLM response judge.

## What Is Still Missing
- True runtime LLM evals with mocked/authenticated API calls.
- Real durable queue/worker execution for research jobs.
- OCR provider integration.
- Human dry-run scoring against real brands.
- Full privacy-mode blocking for every onboarding route.

## Validation
- `npm run eval:onboarding`: passed
- `npm run lint --if-present`: passed
- `npm run build`: passed

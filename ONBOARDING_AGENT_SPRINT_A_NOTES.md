# Onboarding Agent Sprint A Notes
**Date:** 2026-05-13  
**Version:** 3.37.9  
**Scope:** Eval runner, smarter suggested defaults, and source citations.

## What Changed
- Added `npm run eval:onboarding`.
- Added `scripts/onboarding-eval.mjs` with static regression checks for the onboarding agent contract.
- Made `I'm not sure — suggest for me` and `Use the safest default` resolve through context-aware conservative defaults.
- Added draft-level `source_citations` and `assumptions` from planner evidence.
- Added a small “Evidence and assumptions” section to onboarding draft cards.

## Smarter Suggested Defaults
The helper `suggestedValueFor` now uses inferred facts/source summary to choose safer defaults:
- B2B/software/teams language favors LinkedIn + Newsletter and B2B buyers.
- Local/consumer/community language favors local/customers/community defaults.
- Asset rights uncertainty becomes a restrictive default instead of a casual yes.
- Tone avoidance defaults to avoiding unsupported claims, invented proof, aggressive promises, and guaranteed outcomes.

## Source Citations
`/api/onboarding/analyze` now attaches:
- `source_citations`
- `assumptions`
- fact metadata with planner field state and evidence

These are still lightweight citations, but they make draft review less black-box.

## Eval Runner
Run:

```bash
npm run eval:onboarding
```

The runner checks that the codebase still contains key behavioral guardrails:
- company-name-only input is accepted as a starting point
- planner state is followed
- draft readiness and evidence exist
- unsure answers use contextual defaults
- PDF/image honesty remains intact
- draft citations/assumptions are surfaced

## What Is Still Missing
- Runtime LLM evals against real `/api/onboarding/agent-stream` responses.
- OCR for scanned PDFs/images.
- Stronger citation display across every onboarding card, not only draft review.
- Background research jobs with retries and partial result recovery.

## Validation
- `npm run eval:onboarding`: passed
- `npm run lint --if-present`: passed
- `npm run build`: passed

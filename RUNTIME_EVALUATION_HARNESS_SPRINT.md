# Runtime Evaluation Harness Sprint

## A. Files Changed
- `evals/intelligence-runtime-scenarios.json`
- `scripts/intelligence-runtime-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Add a reusable runtime evaluation harness for the intelligence layer so onboarding and gateway regressions can be checked with golden scenarios.

## C. Scenario Catalog
The scenario catalog lives at:
- `evals/intelligence-runtime-scenarios.json`

Current suites:
- `onboarding`
- `gateway`

Current live scenarios:
- company-name-only onboarding input
- weak onboarding input
- explicit website source tracking
- `/api/agent` streaming through gateway
- `/api/claude` D4 secret blocking

## D. Runner
The runner lives at:
- `scripts/intelligence-runtime-eval.mjs`

It performs:
- static harness checks by default
- optional live HTTP scenario execution when env vars are provided
- JSON path assertions
- contains/reject text assertions
- status-code assertions
- stream/text assertions

## E. Scripts
Added:
- `npm run eval:runtime`
- `npm run eval:intelligence`

`eval:intelligence` runs:
- gateway eval
- onboarding eval
- runtime eval

## F. Live Eval Environment
Live evals require:
- `INTELLIGENCE_EVAL_BASE_URL`
- `INTELLIGENCE_EVAL_TOKEN`
- `INTELLIGENCE_EVAL_WORKSPACE_ID`
- `INTELLIGENCE_EVAL_SESSION_ID`

Optional:
- `INTELLIGENCE_EVAL_BRAND_PROFILE_ID`

Without `INTELLIGENCE_EVAL_BASE_URL`, the script runs static harness checks and skips live calls.

## G. What This Catches
- onboarding becoming dismissive or form-like again
- onboarding missing planner/source metadata
- weak input producing premature drafts
- gateway routes exposing raw secrets or raw payload terms
- D4 secret-class payloads being allowed through `/api/claude`
- missing eval wiring before future intelligence sprints

## H. What Is Intentionally Not Implemented
- No provider-cost accuracy benchmark.
- No visual/UI regression testing.
- No synthetic Supabase test tenant creation.
- No CI workflow file yet.
- No long-running agent benchmark.
- No model quality grading by another LLM.

## I. Validation
Results:
- `npm run eval:intelligence` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## J. Remaining Risks
- Live evals require a valid token and seeded workspace/session.
- The current live suite is narrow and should grow as the intelligence layer grows.
- Streaming assertions are text-level only.
- Static checks prove harness wiring, not provider quality.

# Universal AI Gateway Sprint 2

## A. Files Changed
- `src/lib/ai/gateway.js`
- `src/lib/ai/runner.js`
- `src/app/api/claude/route.js`
- `src/app/api/agent/route.js`
- `scripts/intelligence-gateway-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Move the main server-side AI entry points onto the same gateway preparation contract introduced in Sprint 1.

## C. Gateway Expansion
The gateway now supports both:
- prompt-style calls through `prepareGatewayPromptCall`
- message/system-style calls through `prepareGatewayMessageCall`

This lets route handlers share the same task, cost, model metadata, privacy preparation, and safe logging policy.

## D. `/api/claude`
`/api/claude` now prepares requests through the gateway before Anthropic execution.

The route still:
- authenticates the user
- applies the existing rate limit
- checks workspace membership
- uses the existing Anthropic API execution path
- supports streaming and non-streaming responses

The route now receives gateway metadata and uses sanitized gateway messages for provider calls.

## E. `/api/agent`
`/api/agent` now prepares message/system calls through the gateway instead of duplicating task-cost/privacy preparation directly in the route.

Provider execution remains unchanged:
- Anthropic streaming with tool loops
- OpenAI streaming when configured

AI call rows now include gateway metadata in `metadata_json`.

## F. What Is Still Intentionally Not Implemented
- No new providers.
- No verified ZDR/no-retention runtime routing.
- No budget enforcement.
- No full provider abstraction replacement.
- No migration of non-LLM `/api/provider-call`.
- No mandatory workspace preference UI for provider policy.

## G. Validation
Results:
- `npm run eval:gateway` passed.
- `npm run eval:onboarding` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## H. Remaining Risks
- Some legacy call sites still omit `workspace_id`, so gateway policy marks privacy preparation as skipped rather than failing.
- `/api/provider-call` still handles voice/image/provider calls separately.
- Gateway model routing is still conservative; it records policy metadata but does not enforce provider/model selection.
- Budget caps and per-workspace AI policy are still future work.

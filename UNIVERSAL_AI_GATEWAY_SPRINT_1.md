# Universal AI Gateway Sprint 1

## A. Files Changed
- `src/lib/ai/gateway.js`
- `src/lib/ai/runner.js`
- `scripts/intelligence-gateway-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Scope
Sprint 1 adds a universal policy layer around runner-based AI calls. It does not replace the provider stack yet and does not add new providers.

The gateway now normalizes:
- prompt type to assistant `task_type`
- task-based `cost_center` and `cost_category`
- recommended model metadata
- data class and privacy mode metadata
- payload hash and provider privacy profile metadata
- raw-prompt logging guard metadata

## C. What Is Routed Through The Gateway
`runPrompt` and `runPromptStream` now call `prepareGatewayPromptCall` before provider execution. This covers existing prompt registry calls and `agent-call` passthrough calls that use the central runner.

Concrete execution still uses the existing Claude-compatible `/api/claude` path through `callClaudeRaw` and `callClaudeStreamRaw`.

## D. Privacy Behavior
When `workspace_id` is available, the gateway calls the Sprint 7 privacy gateway before provider execution. The sanitized prompt is used for the provider call and safe metadata is written to AI logs.

When legacy call sites do not provide `workspace_id`, the gateway does not break the call. It marks the log metadata with `workspace_missing_privacy_check_skipped`.

`D4_SECRET` payloads remain blocked by the privacy gateway when workspace-scoped privacy checking runs.

## E. Cost And Task Metadata
Task metadata is resolved from `context.task_type` first, then a prompt-type mapping, then `general_help`.

Cost fields are resolved through `getCostFieldsForTask` with context overrides supported for existing call sites.

## F. Model Routing
Sprint 1 records recommended model metadata from the task registry/model routing placeholder. It intentionally keeps concrete provider execution on the existing model path to avoid routing surprises.

## G. What Is Intentionally Not Implemented
- No new provider routing.
- No universal provider abstraction replacement.
- No `/api/agent` migration.
- No `/api/provider-call` migration.
- No budget enforcement.
- No workspace-level AI policy UI.
- No verified ZDR/no-retention routing claims.

## H. Validation
Results:
- `npm run eval:onboarding` passed.
- `npm run eval:gateway` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## I. Remaining Risks
- Some direct API routes still have their own AI/privacy handling.
- Legacy call sites without workspace context cannot receive full privacy enforcement at the runner layer.
- Model routing is metadata-only until provider execution is centralized.
- Budget/cost caps are not enforced yet.

# Universal AI Gateway Sprint 3

## A. Files Changed
- `src/lib/ai/gateway.js`
- `src/app/api/provider-call/route.js`
- `scripts/intelligence-gateway-eval.mjs`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `CLAUDE.md`
- `CURRENT_STATE_AUDIT.md`

## B. Sprint Goal
Bring non-LLM provider calls into the same Universal AI Gateway boundary without changing provider behavior.

## C. Provider Calls Covered
`/api/provider-call` now prepares provider payloads through the gateway for:
- `voice.generate`
- `visual.generate`
- `licensed.search`

This covers ElevenLabs, Flux/Replicate, Pexels, and existing stub providers where configured.

## D. Gateway Behavior
Provider calls now share:
- workspace and brand context
- provider privacy profile checks
- prompt minimization/redaction
- payload hash
- data class and privacy mode metadata
- cost center and cost category metadata
- raw payload logging guard metadata

The gateway does not add new providers and does not change how provider APIs are called.

## E. Provider Cost Logging
`/api/provider-call` now writes safe `ai_calls` rows for provider operations.

Logged fields include:
- action
- provider name
- model/config identifier when available
- brand/workspace/user metadata
- estimated cost when available
- success/failure
- gateway metadata
- no raw provider payloads

## F. What Is Intentionally Not Implemented
- No new provider integrations.
- No publishing automation.
- No Studio features.
- No budget enforcement yet.
- No verified ZDR/no-retention provider routing.
- No provider credential UI changes.

## G. Validation
Results:
- `npm run eval:gateway` passed.
- `npm run eval:onboarding` passed.
- `npm run lint --if-present` completed with no configured lint output.
- `npm run build` passed.

## H. Remaining Risks
- Provider API failures are still best-effort logged; some thrown errors may only be captured by the route-level safe error response.
- Cost estimates for some providers remain approximate or zero where pricing is not implemented.
- Budget caps and workspace policy enforcement still need a dedicated sprint.

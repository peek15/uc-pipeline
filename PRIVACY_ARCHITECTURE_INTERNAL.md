# Creative Engine Privacy Architecture — Internal

**Status:** Sprint 7 foundation, requires legal/provider validation before public use.

## Privacy Modes
- **Standard:** normal business content production. Commercial AI APIs may be used. Creative Engine disables raw prompt/response logging by default, but provider retention may still apply.
- **Confidential:** stricter minimization. D2 confidential data is blocked from unknown-retention and standard-retention AI/media providers.
- **Enhanced Privacy:** D2/D3 data must route only to approved zero/no-retention, no-retention, client-owned, or explicitly configured routes. Some features may be unavailable until those routes exist.
- **Enterprise Custom:** future custom provider routing, client-owned credentials/storage, and bespoke security settings.

## Data Classes
- **D0_PUBLIC:** public website/social/slogan content.
- **D1_BUSINESS_STANDARD:** normal brand/content briefs and business inputs.
- **D2_CONFIDENTIAL:** non-public strategy, pricing, launch plans, commercial positioning.
- **D3_SENSITIVE:** personal data, contracts, financial details, regulated-sector content.
- **D4_SECRET:** API keys, tokens, credentials, webhook secrets. Never route to AI/media providers.

## No-Training vs No-Retention
No-training means the provider says data is not used to train models by default. No-retention / zero-data-retention means the provider does not retain request/response payloads beyond inference except as contractually specified. Providers still process prompts during inference.

## AI Privacy Gateway
`src/lib/privacy/aiPrivacyGateway.js` defines the gateway contract:
- require workspace context;
- normalize data class/privacy mode;
- validate provider privacy profile;
- block D4 and unsafe D2/D3 routing;
- run prompt minimization;
- return sanitized messages/system plus metadata.

Sprint 7 wires the assistant route and legacy Claude route through this gateway. More provider execution paths should move behind the same contract over time.

## Prompt Minimization
`src/lib/privacy/promptMinimization.js` redacts obvious secrets, optionally redacts PII, truncates long content, and returns redaction metadata plus a payload hash. It is regex/rule-based and intentionally conservative.

## No Raw Logs
`src/lib/privacy/safeLogging.js` redacts sensitive fields and produces sanitized error summaries. AI/cost logs should contain metadata only: provider, model, tokens, cost, workspace/brand scope, data class, privacy mode, provider privacy profile, payload hash, and sanitized errors.

## Provider Routing
`src/lib/privacy/providerPrivacyProfiles.js` contains provider privacy profiles. Unknown retention is treated as unsafe for D2/D3. Placeholder ZDR profiles are not enabled until contracts and routing are verified.

## Future Enterprise Path
Enterprise privacy requires:
- verified ZDR/no-retention routes;
- client-owned credentials;
- client-owned storage;
- per-workspace routing policies;
- stronger document extraction and snippet approval;
- legal/security review of subprocessors and DPAs.

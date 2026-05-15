# Current State Audit — Creative Engine
**Date:** 2026-05-15
**Version audited:** 3.56.0
**Scope:** Post-Sprint 11B Studio persistence, workspace invite flow, Create→Studio connection, AI regeneration, error handling cleanup, and Settings UC/legacy defaults cleanup.

## Executive Summary
- Creative Engine is a multi-workspace content operations app with Home, Strategy, Ideas, Pipeline, Create, Studio, Calendar, Analyze, Settings, onboarding, privacy, compliance, approval, and export foundations.
- The product direction is Creative Engine first. Uncle Carter remains supported as a seeded/profile-specific workspace, but generic UI does not surface UC/NBA/storytelling metaphors.
- Studio is a standalone full-screen revision workspace at `/studio/[contentItemId]`. It persists content versions, block-level timelines, revision cards, and AI script regeneration. Video rendering is not yet wired to a provider.
- Workspace creation has a proper setup screen (no `window.prompt`). Email-based pre-invites are backfilled on sign-in via `workspace/link-invites`.
- Create derives real studio blocks from the story script when Studio opens (`src/lib/studio/deriveBlocks.js`); mock blocks are a fallback only.
- AI script regeneration in Studio calls `runPrompt("generate-script")` with revision instructions, saves the new script, replaces blocks, and marks revisions applied.
- Error handling is centralized: `src/lib/errorMessages.js` provides `friendlyAiError()`; ResearchView, AgentPanel, Studio, and Onboarding all map raw errors to actionable copy.
- Settings no longer uses UC-specific defaults for `format_mix`, `sequence_rules`, or `taxonomy.eras`. Copy says "items per week" not "episodes per week".
- Onboarding is the most agentic surface: full-screen, conversation-first, source-aware, streaming-capable, and backed by structured tool traces plus persisted session memory.
- Strategy is the primary editable surface for Brand Profile, Content Strategy, Programmes, and Risk/Claims Guidance. Settings is admin/technical configuration.
- Runner-based AI calls pass through the Universal AI Gateway for task/cost/model metadata, privacy preparation, and safe logging. Concrete provider execution remains on existing routes.
- Optional environment-level AI gateway budget guards exist for daily cost and call caps. Caps are unset by default and fail open.
- Workspace Intelligence Memory V1 persists approved strategy learnings in `intelligence_insights` and retrieves them as advisory context across onboarding, assistant, Ideas, scoring, Create, and translation.
- Adaptive Generic Scoring adapts scoring to brand strategy, market/industry, audience, platforms, programmes, and compliance context while keeping legacy scores for compatibility.

## Current Navigation
- Home: calm cockpit and next action/readiness surface.
- Strategy: editable Brand Profile, Content Strategy, Programmes, Risk/Claims Guidance, onboarding refresh entry.
- Ideas: client-facing label for the former Research surface; internal route key remains `research`.
- Pipeline: operational list of content items with Essential/Detailed display preference.
- Create: production surface for draft/edit/check/approve/export readiness. "Open in Studio" navigates to `/studio/[id]`.
- Studio: standalone full-screen revision workspace — timeline blocks, revision cards, version history, AI regeneration.
- Calendar: planning/readiness surface, not publishing automation.
- Analyze: workspace signals/transparency, not advanced analytics.

## Studio State (Sprint 11B)
- Route: `/studio/[contentItemId]`.
- Tables: `content_versions`, `studio_blocks`, `edit_requests` (SQL: `supabase-sprint11b-studio-data.sql` — applied).
- API routes: `/api/studio/session` (GET/POST), `/api/studio/revisions` (GET/POST/PATCH), `/api/studio/regenerate` (POST).
- Shared block derivation: `src/lib/studio/deriveBlocks.js` — splits script by paragraph, labels Hook/Body/CTA, estimates timecodes at 2.5 words/second.
- Regeneration: calls `runPrompt("generate-script")` with `instruction + current_script`, saves new script, replaces version blocks, marks revisions applied.
- Video preview: not yet available (no provider wired).
- Approve version: UI placeholder — no approval persistence yet.
- "Suggest fix": placeholder, future sprint.

## Workspace Invite / Creation State
- New workspace setup screen at sign-in when no workspaces exist (replaces `window.prompt`).
- New workspaces redirect to `/onboarding?workspace_id=...&mode=brand_setup`.
- Email-based pre-invites: `workspace/link-invites` POST backfills `user_id` in `workspace_members` rows matching the signed-in email.
- Called on app load: `linkInvites().catch(() => {}).finally(() => getWorkspaces())`.

## Universal AI Gateway State
- Gateway module: `src/lib/ai/gateway.js`.
- Runner integration: `src/lib/ai/runner.js`.
- Route integrations: `/api/claude`, `/api/agent`, and `/api/provider-call`.
- Coverage: `runPrompt`, `runPromptStream`, direct Claude prompt calls, agent message/system calls, and provider payload calls for voice/visual/licensed media.
- Budget guard: `src/lib/ai/gatewayBudget.js`.
- Optional cap env vars: `AI_GATEWAY_DAILY_COST_LIMIT_USD` and `AI_GATEWAY_DAILY_CALL_LIMIT`.

## Intelligence Evaluation State
- Static onboarding eval: `scripts/onboarding-eval.mjs`.
- Static gateway eval: `scripts/intelligence-gateway-eval.mjs`.
- Runtime eval runner: `scripts/intelligence-runtime-eval.mjs`.
- Runtime scenario catalog: `evals/intelligence-runtime-scenarios.json`.
- Combined script: `npm run eval:intelligence`.
- Runtime live evals are optional and require `INTELLIGENCE_EVAL_BASE_URL`, `INTELLIGENCE_EVAL_TOKEN`, `INTELLIGENCE_EVAL_WORKSPACE_ID`, and `INTELLIGENCE_EVAL_SESSION_ID`.

## Intelligence Job State
- SQL migration: `supabase-sprint11-intelligence-jobs.sql` (applied).
- Helper library: `src/lib/intelligenceJobs.js`.
- API route: `/api/intelligence-jobs`.
- Active generic processors: `onboarding_research` and `ocr_extraction`.
- Processing is currently API-triggered, not a true background worker/cron loop.

## OCR Provider State
- OCR abstraction: `src/lib/onboardingOcrProvider.js`.
- Provider configuration: `OPENAI_API_KEY`; optional model override `ONBOARDING_OCR_OPENAI_MODEL`.
- Supported OCR path: image uploads with transient base64 handoff.
- Scanned PDF rendering and multi-page OCR are not implemented yet.

## Workspace Intelligence Memory State
- Helper: `src/lib/workspaceMemory.js`.
- API: `/api/workspace-memory`.
- Storage: existing `intelligence_insights` table with `category = memory` and `source = workspace_memory`.
- Retrieval is lexical/rule-scored (no embeddings/vector search yet).
- Memory is advisory prompt context only — does not directly mutate strategy, content, scoring, or exports.
- Settings Workspace Memory lets users keep, edit, archive, or mark memory wrong.

## Adaptive Generic Scoring State
- Helper: `src/lib/adaptiveScoring.js`.
- Research scoring prompt returns adaptive dimensions: idea quality, brand fit, market fit, production readiness, compliance readiness, and adaptive total.
- Adaptive details stored under `metadata.adaptive_score`; legacy score columns remain for compatibility.

## Onboarding State
- Route: `/onboarding`.
- Streaming route: `/api/onboarding/agent-stream`. Non-streaming: `/api/onboarding/chat`. Agent-step alias: `/api/onboarding/agent-step`.
- Session memory route: `/api/onboarding/memory`.
- Shared orchestration: `src/lib/onboardingAgentStep.js`.
- Planner core: `src/lib/onboardingPlanner.js`.
- Strategy critic: `src/lib/onboardingStrategyCritic.js`.
- Brand memory: `src/lib/onboardingBrandMemory.js`.
- Approval is required before writing final Brand Profile, Content Strategy, Programmes, or Risk/Claims Guidance.

## Persistence / Supabase
- All Sprint 10 onboarding migrations applied:
  - `supabase-sprint10-onboarding-agent-memory.sql` ✓
  - `supabase-sprint10-onboarding-fact-confirmation.sql` ✓
  - `supabase-sprint10-onboarding-research-jobs.sql` ✓
- Studio tables applied: `supabase-sprint11b-studio-data.sql` ✓
- Intelligence jobs applied: `supabase-sprint11-intelligence-jobs.sql` ✓

## AI / Agent Architecture
- One right-side assistant panel only for the main app. Onboarding is full-screen and separate.
- AI calls use existing runner/audit patterns through Universal AI Gateway.
- `npm run eval:onboarding` runs static regression checks for the onboarding agent contract.

## Privacy / Compliance
- Sprint 7 privacy helpers and policy direction apply.
- Do not log raw full prompts, full model responses, raw uploaded content, provider secrets, or base64 media unnecessarily.
- Compliance checks are warnings/support tools only. Users remain responsible for claims, rights, publishing, advertising, and legal/platform compliance.

## Build / Validation
- Last validation run:
  - `npm run build`: passed
- Current version: `3.56.0`

## Known Remaining Risks
- Studio "Approve version" has no persistence — UI placeholder only.
- Studio video preview is not wired to a provider.
- Onboarding research jobs run inline; a true durable worker/queue is future work.
- PDF/image scanned OCR is not implemented (requires storage + rendering layer).
- Workspace memory retrieval is lexical, not semantic/vector-based.
- Runtime LLM evals are optional and environment-gated; local evals remain mostly static/contract-based.
- `window.confirm()` remains in bulk delete (PipelineView) — lower priority since it's a destructive action.
- Some UC-specific metadata (`ARCHETYPES`, `FORMATS`) remains in rule builder dropdowns for backward compatibility with UC scheduling rules.

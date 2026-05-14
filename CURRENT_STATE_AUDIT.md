# Current State Audit — Creative Engine / Uncle Carter Pipeline
**Date:** 2026-05-14
**Version audited:** 3.53.0
**Scope:** Current repo state after Intelligence Trust hardening sprint.

## Executive Summary
- Creative Engine is now a multi-workspace content operations app with Home, Strategy, Ideas, Pipeline, Create, Calendar, Analyze, Settings, onboarding, privacy, compliance, approval, and export foundations.
- The product direction is Creative Engine first. Uncle Carter remains supported as a seeded/profile-specific workspace, but generic UI should not surface UC/NBA/storytelling metaphors by default.
- Onboarding is now the most agentic surface: full-screen, conversation-first, source-aware, streaming-capable, and backed by structured tool traces plus persisted session memory.
- Strategy is the primary editable surface for Brand Profile, Content Strategy, Programmes, and Risk/Claims Guidance. Settings is admin/technical configuration.
- Pipeline has an Appearance preference for Essential/Detailed display density. The preference is UI-only and does not affect scoring, ranking, generation, or saved data.
- Compliance, approval, acknowledgement, and export package flows exist as workflow support. They are not legal guarantees and do not add mandatory Peek Media review.
- Runner-based AI calls, `/api/claude`, `/api/agent`, and `/api/provider-call` now pass through the Universal AI Gateway preparation layer for task/cost/model metadata, privacy preparation, and safe logging fields. Concrete provider execution remains on the existing route implementations.
- Optional environment-level AI gateway budget guards now exist for daily workspace cost and call caps. Caps are unset by default and fail open unless explicitly configured.
- Runtime intelligence evaluation now has a scenario catalog and reusable runner for static checks plus optional live onboarding/gateway HTTP scenarios.
- Generic intelligence job scaffolding now exists with a workspace-scoped `intelligence_jobs` table, helper library, API route, and eval checks.
- Onboarding image OCR can now run through OpenAI vision when `OPENAI_API_KEY` is configured, with raw image data used transiently and not persisted.
- PDF/image sources that cannot be analyzed synchronously now enqueue `ocr_extraction` jobs in the generic intelligence job system.
- Workspace Intelligence Memory V1 now persists approved strategy learnings in `intelligence_insights` and retrieves them into onboarding agent context.
- Adaptive Generic Scoring now adapts content scoring to the user's brand strategy, market/industry, audience, platforms, programmes, and compliance context while keeping legacy scores for compatibility.
- Workspace memory now flows into operational assistant, Ideas/Research, adaptive scoring, Create generation, translation, and reach scoring as advisory context.
- Workspace memory retrieval is now hardened with candidate widening, effective confidence weighting, status/recency/source weighting, dedupe, prompt caps, and source-group metadata.
- AI call logs now include safe memory-use metadata (`workspace_memory_used`, counts, IDs, source groups) without raw memory/source payloads.
- Runtime intelligence evals now include a governed workspace-memory retrieval scenario and GET/path placeholder support.
- Privacy export/delete manifest scaffolds now include intelligence and memory tables so intelligence-layer data is represented in privacy reviews.
- Settings now has a Workspace Memory governance section. Brand Profile, Strategy, and Programmes are no longer primary Settings sections; they live in the Strategy tab.

## Current Navigation
- Home: calm cockpit and next action/readiness surface.
- Strategy: editable Brand Profile, Content Strategy, Programmes, Risk/Claims Guidance, onboarding refresh entry.
- Ideas: client-facing label for the former Research surface; internal route key remains `research`.
- Pipeline: operational list of content items with Essential/Detailed display preference.
- Create: production surface for draft/edit/check/approve/export readiness.
- Calendar: planning/readiness surface, not publishing automation.
- Analyze: workspace signals/transparency, not advanced analytics.
- Campaigns: secondary planning/legacy surface, not a primary Creative Engine promise yet.

## Universal AI Gateway State
- Gateway module: `src/lib/ai/gateway.js`.
- Runner integration: `src/lib/ai/runner.js`.
- Route integrations: `/api/claude`, `/api/agent`, and `/api/provider-call`.
- Coverage: `runPrompt`, `runPromptStream`, direct Claude prompt calls, agent message/system calls, and provider payload calls for voice/visual/licensed media.
- The gateway resolves task type from explicit `context.task_type`, then prompt-type mapping, then `general_help`.
- Cost metadata is resolved from the task registry and can be overridden by call context.
- Model routing is currently metadata-only. Recommended models are logged, but execution stays on the existing Claude-compatible path to avoid routing surprises.
- Workspace-scoped runner calls are prepared through the Sprint 7 privacy gateway before provider execution.
- Legacy calls without `workspace_id` still work and are marked `workspace_missing_privacy_check_skipped`.
- Gateway logs include data class, privacy mode, provider privacy profile where available, payload hash, task type, cost center/category, and `raw_prompt_logged: false`.
- Provider cost/audit rows now include safe gateway metadata and `raw_payload_logged: false`.
- Budget guard: `src/lib/ai/gatewayBudget.js`.
- Optional cap env vars: `AI_GATEWAY_DAILY_COST_LIMIT_USD` and `AI_GATEWAY_DAILY_CALL_LIMIT`.
- Budget checks run before `/api/claude`, `/api/agent`, and `/api/provider-call` execution when caps are configured.
- Remaining gateway work: workspace policy UI, transactional quota enforcement, and provider/runtime routing behind the same policy boundary.

## Intelligence Evaluation State
- Static onboarding eval: `scripts/onboarding-eval.mjs`.
- Static gateway eval: `scripts/intelligence-gateway-eval.mjs`.
- Runtime eval runner: `scripts/intelligence-runtime-eval.mjs`.
- Runtime scenario catalog: `evals/intelligence-runtime-scenarios.json`.
- Combined script: `npm run eval:intelligence`.
- Runtime live evals are optional and require `INTELLIGENCE_EVAL_BASE_URL`, `INTELLIGENCE_EVAL_TOKEN`, `INTELLIGENCE_EVAL_WORKSPACE_ID`, and `INTELLIGENCE_EVAL_SESSION_ID`.
- Current runtime suites cover onboarding conversation behavior, source tracking, gateway streaming, governed workspace-memory retrieval, and D4 secret blocking.

## Intelligence Job State
- SQL migration: `supabase-sprint11-intelligence-jobs.sql`.
- Helper library: `src/lib/intelligenceJobs.js`.
- API route: `/api/intelligence-jobs`.
- Eval: `scripts/intelligence-jobs-eval.mjs`.
- Combined eval script includes job checks through `npm run eval:intelligence`.
- Active generic processors: `onboarding_research` and `ocr_extraction`.
- `ocr_extraction` updates `onboarding_sources.metadata_json` with job status, OCR provider status, gateway metadata, and limitations.
- Other job types are modeled but intentionally fail until processors are implemented.
- Processing is currently API-triggered, not a true background worker/cron loop.

## OCR Provider State
- OCR abstraction: `src/lib/onboardingOcrProvider.js`.
- OCR API: `/api/onboarding/ocr`.
- Source intake integration: `/api/onboarding/source`.
- Provider configuration: `OPENAI_API_KEY`; optional model override `ONBOARDING_OCR_OPENAI_MODEL`.
- Supported OCR path: image uploads with transient base64 handoff.
- Supported non-OCR extraction: text/markdown and lightweight readable PDF text extraction.
- Raw base64 image data is not stored in onboarding source metadata.
- Scanned PDF rendering and multi-page OCR are not implemented yet.
- Queued OCR jobs do not persist raw base64 media; async image OCR needs a durable file reference/storage path before it can process images after the initial request.

## Workspace Intelligence Memory State
- Helper: `src/lib/workspaceMemory.js`.
- API: `/api/workspace-memory`.
- Eval: `scripts/workspace-memory-eval.mjs`.
- Storage: existing `intelligence_insights` table with `category = memory` and `source = workspace_memory`.
- Onboarding approval writes memory for Brand Profile, Content Strategy, Programmes, and Risk/Claims Guidance.
- Onboarding agent step retrieves durable workspace memory and injects it into the prompt as source-aware context.
- The main assistant route retrieves durable workspace memory and appends it to the system context after workspace membership verification.
- `src/lib/ai/runner.js` can retrieve memory through `/api/workspace-memory` for memory-aware operational prompts when `workspace_id` and `brand_profile_id` are present.
- Memory-aware prompt types include Research/Ideas, adaptive scoring, script generation, translation, reach scoring, and passthrough agent calls.
- Settings Workspace Memory lets users keep, edit, archive, or mark memory wrong.
- Archived/wrong/dismissed/rejected memory is not active memory and is excluded from retrieval because retrieval only uses open, reviewed, and applied rows.
- Retrieval uses a wider candidate window, excludes inactive statuses, calculates effective confidence from base confidence/status/recency/source, dedupes near-identical memory, caps prompt memory, and returns `source_groups` plus `memory_context`.
- Runner and assistant logs include memory-use metadata only: used flag, count, IDs, and source groups. They do not log full raw memory rows.
- No embeddings/vector search yet.
- No automatic strategy/content/scoring mutation from memory. Memory is advisory prompt context only.

## Adaptive Generic Scoring State
- Helper: `src/lib/adaptiveScoring.js`.
- Eval: `scripts/adaptive-scoring-eval.mjs`.
- Research scoring prompt now returns adaptive dimensions: idea quality, brand fit, market fit, production readiness, compliance readiness, and adaptive total.
- Reach scoring prompt now evaluates adaptive reach potential for the user's market/audience/platform context instead of UC/sports recognition.
- Research persists adaptive details under `metadata.adaptive_score` when AI scoring runs.
- Pipeline sorting and visible score display use `getAdaptiveScore(story, settings)` so scores adapt to current brand settings and fall back deterministically when saved adaptive metadata is missing.
- Detail modal foregrounds adaptive score, Brand fit, Market fit, Production, and Compliance while leaving legacy score rows available as compatibility metadata.
- No database migration is required; adaptive scoring is stored in existing JSON metadata and existing legacy score columns remain untouched.
- Adaptive scores do not change generation, ranking policy beyond UI sort/display, or workspace strategy automatically.

## Onboarding State
- Route: `/onboarding`.
- Right-side AgentPanel is hidden during onboarding.
- Main APIs:
  - `/api/onboarding/agent-step`
  - `/api/onboarding/agent-stream`
  - `/api/onboarding/chat`
  - `/api/onboarding/memory`
  - `/api/onboarding/session`
  - `/api/onboarding/source`
  - `/api/onboarding/analyze`
  - `/api/onboarding/clarification`
  - `/api/onboarding/approve`
- Shared orchestration lives in `src/lib/onboardingAgentStep.js`.
- Source intelligence lives in `src/lib/onboardingWebResearch.js`.
- Source intelligence can detect a likely official website, read the homepage, discover a few same-domain About/Product/Services-style pages, extract evidence snippets, and attach source confidence.
- Saved onboarding sources now carry lightweight source intelligence metadata. Text/MD/manual-answer sources are summarized with deterministic evidence snippets; PDF/image sources are stored but honestly marked pending until OCR/text extraction exists.
- Streaming responses are server-sent event style from `/api/onboarding/agent-stream`.
- Agent turns return assistant message, tool calls, agent state, inferred facts, missing fields, confidence, next action, suggested replies, sources used, and draft readiness.
- The UI renders streamed assistant text, tool-call cards, source chips, suggested replies, setup brief memory, WorkTrace, understanding cards, clarification cards, draft cards, and approval.
- PDF/image uploads are not deeply parsed; they must remain marked pending/unsupported unless real parsing is added.
- User approval remains required before writing final strategy/settings.
- Drafts can now be refined conversationally before approval through `/api/onboarding/refine-draft`; previous draft rows are superseded and the revised draft still requires explicit approval.
- Functional onboarding state is persisted through `/api/onboarding/state` and restored before transcript fallback, so reloads can recover the current phase, intake, facts, clarifications, answers, draft, and setup brief.
- Onboarding now has an explicit planner core in `src/lib/onboardingPlanner.js`. Planner output includes stage, goal, next action, field states, missing/uncertain fields, source coverage, fact evidence, draft readiness, and clarification queue.
- Document intelligence lives in `src/lib/onboardingDocumentIntelligence.js`. It supports direct text/markdown parsing and lightweight PDF text extraction when the PDF exposes readable text. Scanned PDFs/images remain pending and must not be described as analyzed.
- Drafts now include lightweight `source_citations` and `assumptions` from planner evidence. The onboarding draft card surfaces those citations before approval.
- `I'm not sure — suggest for me` now resolves to context-aware conservative defaults instead of one generic default.
- Research now routes through `src/lib/onboardingResearchJobs.js`, with retry attempts and persisted job state when `onboarding_research_jobs` exists.
- Draft generation now runs a deterministic strategy critic in `src/lib/onboardingStrategyCritic.js`.
- Approval now stores durable brand memory and refresh diffs through `src/lib/onboardingBrandMemory.js`.
- V1 onboarding limits live in `src/lib/onboardingGuardrails.js`.
- Research jobs can now be enqueued and processed through `/api/onboarding/research-job`.
- OCR provider status is explicit in `src/lib/onboardingOcrProvider.js` and `/api/onboarding/ocr`.
- `npm run eval:onboarding` supports optional live API checks when `ONBOARDING_EVAL_*` environment variables are provided.
- New routes:
  - `/api/onboarding/research-job`
  - `/api/onboarding/ocr`
- Uploaded files now carry OCR status metadata (`not_required`, `pdf_text_extracted`, `requires_ocr`, `not_available`).

## Persistence / Supabase
- Sprint 6 onboarding tables remain the foundation:
  - `onboarding_sessions`
  - `onboarding_sources`
  - `onboarding_extracted_facts`
  - `onboarding_clarifications`
  - `onboarding_drafts`
- New migration to apply:
  - `supabase-sprint10-onboarding-agent-memory.sql`
  - `supabase-sprint10-onboarding-fact-confirmation.sql`
  - `supabase-sprint10-onboarding-research-jobs.sql`
- New table:
  - `onboarding_agent_memory`
- Purpose:
  - Persist user turns, assistant turns, tool traces, source trace metadata, and agent state snapshots.
  - Allow onboarding reload/session recovery.
- `/api/onboarding/state` stores latest functional recovery snapshots as system events in `onboarding_agent_memory`.
- Fact confirmation extends `onboarding_extracted_facts` with `status`, reviewer, timestamp, and metadata fields.
- Until the migrations are applied, onboarding still works, but persisted agent memory/fact confirmation are unavailable.

## AI / Agent Architecture
- There is still one normal right-side assistant panel for the main app.
- Onboarding is a full-screen mode powered by the same assistant/orchestration concepts, not a second visible assistant panel.
- AI calls use existing runner/audit patterns.
- Agent tool traces are high-level work records, not chain-of-thought.
- Web/source lookup is pragmatic and limited; it is not competitor scan, market intelligence, social research, or broad crawling.
- Reviewed fact memory now affects agent behavior: confirmed/edited facts override inference, while rejected/unsure facts are cleared so the agent asks rather than repeats bad assumptions.
- Agent prompt behavior now follows planner state (`collect_source`, `ask_missing_required`, `review_then_draft`, `draft_strategy`) so replies should be guided by context and missing information instead of pre-registered form copy.
- `npm run eval:onboarding` runs static regression checks for the onboarding agent contract.

## Privacy / Compliance
- Sprint 7 privacy helpers and policy direction still apply.
- Do not log raw full prompts, full model responses, raw uploaded content, provider secrets, or base64 media unnecessarily.
- Privacy export/delete manifests now cover onboarding agent memory, onboarding research jobs, intelligence insights/jobs, performance snapshots, agent feedback, and privacy requests.
- Compliance checks are warnings/support tools only. Users remain responsible for claims, rights, publishing, advertising, and legal/platform compliance.
- No ZDR/no-retention claims should be made unless verified contractually and technically.

## Build / Validation
- Last validation run:
  - `npm run eval:intelligence`: passed
  - `npm run lint --if-present`: passed
  - `npm run build`: passed
- Current version: `3.53.0`

## Known Remaining Risks
- `supabase-sprint10-onboarding-agent-memory.sql` must be applied before session memory persistence is live in production.
- Streaming depends on the existing Anthropic stream wrapper. If provider streaming fails, the non-streaming/fallback path still returns a response.
- Source intelligence is still lightweight and should not be treated as verified market research or legal/compliance review.
- Session memory recovery restores latest active memory/state snapshots but is not yet a full replayable state machine.
- PDF/image understanding is still not implemented.
- Image OCR and scanned-PDF OCR are still not implemented.
- Automated agent evaluation is documented but not yet installed as a CI gate.
- Runtime LLM evals are optional and environment-gated; local evals remain mostly static/contract-based.
- Research jobs currently run inline in the request; a true durable worker/queue remains future work.
- Queued jobs require an external caller/cron/worker to invoke `action: "process"`; no automatic scheduler is installed.
- OCR provider status is explicit, but real OCR/vision provider integration remains future work.
- Strategy quality review is deterministic. It improves trust and review, but it is not a substitute for expert legal/claims review.
- Adaptive scoring is V1 and rule/AI hybrid. It is more generic and market-aware, but it is not a validated performance predictor.
- Workspace memory retrieval is still lexical/rule-scored rather than semantic/vector-based.
- Some legacy UC/story metadata may remain in lower-level constants/data paths for backward compatibility; generic UI should keep hiding or scoping it.

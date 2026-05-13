# Intelligence Layer Audit
**Date:** 2026-05-13  
**Version audited:** 3.40.0  
**Scope:** Creative Engine / Uncle Carter Pipeline intelligence, agents, scoring, compliance, onboarding, memory, evaluation, privacy, cost, and analytics signals.

## Executive Summary
Creative Engine now has a real intelligence foundation, but it is not yet a fully unified intelligence platform.

The strongest subsystem is onboarding: it has a planner, source research, document handling, memory, fact confirmation, draft refinement, citations, quality review, guardrails, and eval scaffolding.

The weakest areas are cross-product consistency, runtime evaluation, durable background execution, and full memory/learning loops outside onboarding. Several intelligent features exist as local rule engines or prompt calls, but they do not yet share one common planning/evaluation/memory substrate.

## Intelligence Inventory

### 1. Core Assistant
Files:
- `src/components/AgentPanel.jsx`
- `src/app/api/agent/route.js`
- `src/lib/agent/taskTypes.js`
- `src/lib/agent/modelRouting.js`
- `src/lib/agent/AssistantContext.js`
- `src/lib/agent/agentContext.js`

Current state:
- One visible assistant panel.
- Context-aware task types and cost-center mapping exist.
- Tool use exists for `write_insight`, `db_read`, and `audit_read`.
- Supports Anthropic/OpenAI model selection.
- Privacy gateway is partially wired in `/api/agent`.

Gaps:
- Model routing is still advisory; it does not enforce task/model/privacy selection.
- Tool permissions are coarse and mostly prompt-governed.
- Assistant actions are not evaluated.
- Agent memory is local/history-oriented, not durable across workspaces except when writing insights.
- No shared planner comparable to onboarding.

Recommended improvements:
- Add a shared `AgentPlan` structure for all assistant tasks.
- Enforce model routing by task type and privacy mode server-side.
- Add tool-call audit events with input/output summaries.
- Add assistant eval scenarios for compliance warning explanation, safer rewrite, pipeline next action, strategy advice, and export help.
- Promote useful assistant outputs into durable `intelligence_insights` only with explicit category/confidence rules.

### 2. Onboarding Agent
Files:
- `src/lib/onboardingAgentStep.js`
- `src/lib/onboardingPlanner.js`
- `src/lib/onboardingWebResearch.js`
- `src/lib/onboardingResearchJobs.js`
- `src/lib/onboardingDocumentIntelligence.js`
- `src/lib/onboardingOcrProvider.js`
- `src/lib/onboardingStrategyCritic.js`
- `src/lib/onboardingBrandMemory.js`
- `src/lib/onboardingGuardrails.js`
- `src/app/api/onboarding/*`
- `scripts/onboarding-eval.mjs`

Current state:
- Best-developed intelligence subsystem.
- Has planner state, source evidence, citations, assumptions, draft quality review, fact confirmation, draft refinement, recovery snapshots, research jobs, OCR-ready route, and static/live eval scaffolding.
- Approval writes durable brand memory and refresh diff.

Gaps:
- Research jobs require manual/API processing; no cron/worker is installed.
- OCR provider is explicit but not real.
- Live eval requires manually supplied env vars and test fixtures.
- Strategy critic is deterministic and useful, but shallow.
- Source citations are strongest in draft review; they are not fully first-class across every card and approved settings view.

Recommended improvements:
- Add a scheduled worker/cron for queued onboarding research jobs.
- Add a verified OCR/vision provider after privacy/provider routing is approved.
- Expand live eval fixtures and run them in CI/staging.
- Add critic categories for platform risk, weak differentiation, unsupported programme logic, and idea duplication.
- Store approved citation summaries in a dedicated structured field, not only inside settings JSON.

### 3. Research / Ideas Intelligence
Files:
- `src/components/ResearchView.jsx`
- `src/lib/ai/prompts/research-stories.js`
- `src/lib/ai/prompts/score-story.js`
- `src/lib/qualityGate.js`

Current state:
- Generates ideas/stories from prompts.
- Scores results with AI.
- Applies rule-based quality gate before adding to Pipeline.
- Tenant-scoped localStorage exists for research results/scores.

Gaps:
- Still carries legacy story/scoring assumptions.
- Scoring rubric is not clearly tied to Brand Strategy/Programmes for generic Creative Engine.
- Research results and scores live partly in localStorage, not durable eval/history.
- Quality gate is deterministic but some defaults are still UC/sports-shaped unless settings override them.
- No source citations for generated ideas.

Recommended improvements:
- Reframe scoring around generic content usefulness: audience fit, strategic fit, evidence availability, production readiness, compliance risk, platform fit.
- Persist research runs and scoring snapshots in Supabase.
- Attach source/context trace to each idea.
- Add evaluation cases for generic B2B, local business, ecommerce, regulated services, and UC profile.
- Separate “creative quality” from “commercial readiness” from “compliance risk.”

### 4. Pipeline / Create Production Agents
Files:
- `src/components/ProductionView.jsx`
- `src/lib/ai/agent-runner.js`
- `src/lib/ai/agents/brief-author.js`
- `src/lib/ai/agents/asset-curator.js`
- `src/lib/ai/agents/voice-producer.js`
- `src/lib/ai/agents/visual-ranker.js`
- `src/lib/ai/agents/assembly-author.js`

Current state:
- Multiple internal production agents exist behind the production surface.
- Agent feedback can be recorded.
- Brief, voice, visual, asset, and assembly flows exist.
- Uses brand profile context.

Gaps:
- These agents are not integrated with the same planner/eval/memory rigor as onboarding.
- Agent feedback is captured but not clearly used to improve future outputs.
- Production stages are not consistently linked to compliance/approval/export readiness.
- Visual/voice/storage provider behavior depends heavily on configured providers and stubs.
- Generated outputs lack systematic source/citation/work trace.

Recommended improvements:
- Add a production planner/state object similar to onboarding.
- Add per-agent eval tests and regression fixtures.
- Turn `agent_feedback` into a usable learning loop: recent corrections should be summarized and injected into future prompts.
- Add production work traces and citations/work review consistently.
- Add readiness gates that connect draft, compliance, approval, assets, and export.

### 5. Compliance / Approval / Export Intelligence
Files:
- `src/lib/compliance/*`
- `src/app/api/compliance/check/route.js`
- `src/app/api/compliance/acknowledge/route.js`
- `src/app/api/approval/*`
- `src/app/api/export/content/route.js`
- `src/components/DetailModal.jsx`

Current state:
- Rule-based compliance audit exists.
- Approval requires clear/acknowledged compliance state.
- Export packages include compliance/approval metadata.
- Copy correctly avoids legal guarantees.

Gaps:
- Compliance is rule-based only; no LLM-assisted explanation/check unless routed through assistant.
- Rules are useful but not comprehensive by industry/platform.
- Acknowledgement and approval flow exists mainly in DetailModal.
- Risk feedback is not consistently fed back into Strategy/Programmes.

Recommended improvements:
- Add optional LLM compliance explanation through the assistant with strict disclaimers and no legal-guarantee language.
- Add industry-sensitive rule packs driven by Strategy risk fields.
- Store recurring warning patterns as workspace signals.
- Feed compliance patterns back into Strategy suggestions.
- Add export package eval tests.

### 6. Analyze / Workspace Signals
Files:
- `src/components/AnalyzeView.jsx`
- `src/lib/prediction.js`
- `src/lib/performance.js`
- `intelligence_insights`
- `performance_snapshots`
- `ai_calls`

Current state:
- Analyze is framed correctly as workspace signals/transparency.
- Prediction is deterministic and cautious.
- Can display content status, approvals/exports, compliance patterns, cost/usage, and performance snapshots where available.

Gaps:
- Signals are mostly descriptive; little closed-loop learning.
- Predictions are directional and sample-size limited.
- Imported performance data is thin.
- Intelligence insights are not yet synthesized into decisions.

Recommended improvements:
- Add a signal synthesis job that writes weekly workspace insights.
- Add sample-size warnings everywhere predictions appear.
- Add feedback loops from approval/export/compliance into programme recommendations.
- Add “what changed this week” summaries.
- Keep Analyze honest: no predictive claims until there is real performance data.

### 7. Privacy / Cost / Provider Intelligence
Files:
- `src/lib/privacy/*`
- `src/lib/ai/audit.js`
- `src/app/api/provider-call/route.js`
- `src/app/api/provider-config/route.js`
- `src/components/ProvidersSection.jsx`

Current state:
- Privacy data classes and modes exist.
- Safe logging helpers exist.
- AI calls are logged with estimated costs.
- Provider privacy profiles exist.
- Some routes use privacy checks.

Gaps:
- Privacy gateway is not universally enforced through all AI pathways.
- Cost caps are local to onboarding guardrails, not global.
- Provider/model routing does not fully enforce privacy/cost/task policy.
- ZDR/no-retention profiles remain placeholders unless contracts/runtime are verified.

Recommended improvements:
- Create one enforced AI execution gateway and migrate all LLM calls through it.
- Add workspace/session cost budgets for onboarding, assistant, Create, compliance.
- Add provider routing policy: data class + privacy mode + task risk + cost budget.
- Add cost anomaly insights.
- Add privacy-mode tests for every AI route.

## Highest-Priority Gaps
1. **No universal AI gateway.**  
   AI calls still go through multiple paths. This makes privacy, model routing, logging, and cost caps uneven.

2. **No automatic worker/cron for queued intelligence jobs.**  
   Research jobs can be queued/processed, but processing requires a caller.

3. **No real OCR/vision provider.**  
   The app is honest about this, but document-heavy onboarding will still feel limited.

4. **Runtime evals are not CI-grade yet.**  
   Static evals exist. Live eval mode exists. Real fixtures and CI/staging tokens are still missing.

5. **Learning loops are incomplete outside onboarding.**  
   Feedback, compliance warnings, exports, and performance signals are not yet consistently turned into strategy/programme improvements.

6. **Generic content scoring needs a full post-UC redesign.**  
   Pipeline UI is calmer, but scoring logic still carries legacy “story” assumptions in places.

7. **Assistant is less agentic than onboarding.**  
   Main assistant has tools and context, but not the same planner/state/critic/memory discipline.

## Recommended Intelligence Roadmap

### Sprint 1 — Universal AI Gateway
Goal: one enforced path for all LLM calls.
- Route `runPrompt`, AgentPanel, onboarding, compliance assistance, and production agents through a common gateway.
- Enforce data class/privacy mode.
- Enforce task-type model routing.
- Enforce per-workspace/session budgets.
- Standardize logging metadata.

Outcome:
- Safer, cheaper, more observable intelligence layer.

### Sprint 2 — Runtime Evaluation Harness
Goal: make intelligence quality testable.
- Add fixture-based live evals for onboarding, assistant, compliance, research scoring, and production agents.
- Add expected/forbidden phrase checks plus JSON/schema checks.
- Add source-honesty checks.
- Add CI/staging mode.

Outcome:
- Regressions become visible before demos.

### Sprint 3 — Worker / Job System
Goal: long-running intelligence tasks become reliable.
- Add scheduled processing for onboarding research jobs.
- Add job records for document extraction, strategy critic, weekly signals, and production tasks.
- Add retry, timeout, partial result, cancelled, and failed states.

Outcome:
- Agent can do longer work without blocking the UI.

### Sprint 4 — Document/OCR Provider Integration
Goal: support real scanned PDFs/images.
- Add approved OCR/vision provider path.
- Respect privacy mode and data class.
- Store extracted text/evidence, not raw unnecessary media.
- Add evals for readable PDF, scanned PDF, image, and failure cases.

Outcome:
- Upload-based onboarding becomes much more credible.

### Sprint 5 — Intelligence Memory Layer
Goal: durable learning across workflows.
- Normalize brand memory, agent feedback, compliance patterns, export outcomes, performance signals.
- Add memory summarization jobs.
- Feed approved memories into Strategy, Ideas, Create, and assistant context.

Outcome:
- Creative Engine starts improving from client usage.

### Sprint 6 — Generic Scoring / Readiness Redesign
Goal: replace legacy story-first scoring assumptions.
- Create generic content readiness model.
- Separate strategic fit, production readiness, compliance risk, platform fit, and evidence support.
- Preserve UC-specific behavior only when UC profile requires it.

Outcome:
- The intelligence layer feels Creative Engine-native, not UC-retrofitted.

## Suggested Order
1. Universal AI Gateway
2. Runtime Evaluation Harness
3. Worker / Job System
4. Document/OCR Provider Integration
5. Intelligence Memory Layer
6. Generic Scoring / Readiness Redesign

## Pilot Readiness Assessment
Current intelligence layer is good enough for controlled internal dry runs and carefully scoped demos.

It is not yet fully pilot-grade for arbitrary client onboarding because:
- OCR is not real.
- Workers are not automatic.
- Runtime evals are not CI-grade.
- Main assistant and production agents do not share onboarding’s planner/memory/eval discipline.
- Generic scoring still needs deeper redesign.

## Bottom Line
Onboarding now has the right architecture. The next step is to turn that pattern into the platform-wide intelligence standard: one AI gateway, one eval discipline, one job system, one memory layer, and generic Creative Engine scoring.

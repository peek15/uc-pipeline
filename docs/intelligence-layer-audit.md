# Intelligence Layer Audit

Date: 2026-05-08  
App baseline: v3.18.2

Update: v3.18.3 ships Phase 1, replacing the static Settings Intelligence copy with a live module-status dashboard.

## Executive Summary

The app has a strong assisted-production layer, but it is not yet a true closed-loop intelligence system.

What exists today is useful: AI ideation, scoring, template-aware quality gates, production agents, provider diagnostics, calendar audits, AI usage tracking, and correction logging. The weak point is that most intelligence is still stateless or lightly contextual. The system records signals, but it rarely converts them into persistent recommendations, calibrated weights, predictions, or automatic workflow improvements.

Current maturity: Stage 1.5 out of 4.

- Stage 1 Data capture: mostly present.
- Stage 2 Pattern recognition: partially present in Insights and Settings audits.
- Stage 3 Predictive scoring: schema fields exist, but prediction is not implemented.
- Stage 4 Autonomous strategy/debug intelligence: planned pieces exist, but tools are stubbed.

## Current Intelligence Inventory

### 1. Brand And Template Context

Status: Strong foundation.

Implemented:
- Brand settings live in `brand_profiles.settings`.
- Prompts receive brand voice, avoid rules, goals, languages, taxonomy, programmes, and templates.
- Onboarding can propose content templates from brand memory and dedupe against existing templates.
- Research, Create, brief generation, and assembly generation read the selected content template.

Main issue:
- This context is injected into prompts, but it is not yet transformed into a reusable memory model. The app does not maintain durable "this brand performs better with X" facts.

### 2. Research Intelligence

Status: Useful, but prompt-led rather than evidence-led.

Implemented:
- Research can target templates.
- AI generates ideas with template metadata.
- Existing titles are passed to avoid duplicates.
- `score-story` ranks ideas on emotional depth, obscurity, visual potential, and hook strength.
- Quality Gate blocks or warns before adding weak items.

Gaps:
- Scoring dimensions are still narrative-biased for ads, publicity, product, education, and community content.
- Score weights are static. They do not learn from later performance.
- Reach scoring exists as a prompt, but it is subjective and not backed by web/search/social signals.
- Research does not use historical winners/losers except indirectly through settings prompts.

### 3. Quality Gate

Status: One of the strongest pieces.

Implemented:
- Template-aware gate profiles for narrative, ad, publicity, product, educational, community, and generic content.
- Gate output persists status, blockers, warnings, checked timestamp, score, profile, template id, and content type.
- Gate is integrated into Research, Pipeline, Detail, and Calendar.

Gaps:
- Gate rules are hardcoded in `qualityGate.js`.
- Settings has no custom gate profile editor per template.
- Gate does not learn which warnings actually predict bad performance.
- Gate is a checklist, not yet a calibrated risk model.

### 4. Calendar / Planning Intelligence

Status: Good operational intelligence.

Implemented:
- Weekly planner audit checks cadence, quality, scripts, sequence, and format mix.
- Safe auto-fill avoids blocked content.
- Ready queue ranks by `score_total + reach_score`.
- Strategy rules can be suggested/audited in Settings.

Gaps:
- Planning ranking is a simple sum, not a learned recommendation.
- Calendar does not explain "why this item should go here" beyond rule coverage.
- Platform/channel timing intelligence is not implemented.
- No memory of which days, formats, templates, or channels historically perform best.

### 5. Production Agents

Status: Strong workflow automation, moderate intelligence.

Implemented agents:
- `brief-author`
- `asset-curator`
- `voice-producer`
- `visual-ranker`
- `assembly-author`

Strengths:
- Agents receive brand identity and template context.
- Agent feedback is logged after edits/rejections.
- Visual ranker uses past selected visuals as few-shot context.
- Confidence uses a hybrid self-report plus heuristic signal approach.
- Production artifacts persist into structured JSON fields.

Gaps:
- Feedback is only read as recent examples, not summarized into durable preferences.
- `agent_feedback` is not analyzed into patterns like "user always removes cinematic references" or "briefs need product proof."
- Most agents do not receive performance outcomes, only correction outcomes.
- Production agents are still strongest for video workflows; non-video templates work structurally but lack specialized downstream tools.

### 6. Insights / Performance Intelligence

Status: Basic analytics, not yet learning.

Implemented:
- Manual metric logging.
- Metricool CSV import.
- Completion correlation with AI score.
- Breakdowns by format, archetype, and era.
- Intelligence stage tracker in Insights and Settings.

Gaps:
- The stage tracker promises future activation, but those activations are not real yet.
- No `performance_snapshots` table; metrics live directly on `stories`.
- `predicted_score` exists in schema but is not calculated.
- No metric profiles for ad/email/web/campaign metrics.
- Insights are not fed back into Research, Calendar, Quality Gate, or agents except through manual settings prompts.

### 7. Agent Panel

Status: Helpful assistant, not yet a true app agent.

Implemented:
- Chat agent can see active stories, current tab, 7-day AI usage, and settings-derived brand context.
- It can navigate, open stories, and change statuses through action tags.
- It supports Anthropic/OpenAI routing and image inputs.

Gaps:
- It does not have tool calling.
- It cannot query Supabase beyond the preloaded story snapshot.
- It cannot read diagnostics directly unless the user copies/pastes the diagnostics context.
- It cannot write insights, create debug reports, or propose patch-level fixes.
- Provider key lookup is currently tied to default brand id in the API route, not the active tenant.

### 8. Diagnostics / Debug Intelligence

Status: Good first step.

Implemented:
- Providers Diagnostics tab checks key schema probes.
- Summarizes provider health, AI failures, loaded cost, missing provider slots.
- Exports a redacted debug bundle.
- Copies a compact agent context.

Gaps:
- No persistent app log table.
- No client error boundary reporting into Supabase.
- No server-side route health checks.
- No debug agent that can read logs and recommend a fix.
- Diagnostic bundle is export/copy only; it is not directly available to the in-app agent.

## Key Architectural Gaps

### Gap 1: Signals Are Collected But Not Normalized

Important signals are scattered:
- `stories` metrics
- `ai_calls`
- `audit_log`
- `agent_feedback`
- `visual_assets`
- `asset_library`
- `quality_gate`
- `brand_profiles.settings`

The app needs a normalized intelligence event or insight layer so agents can learn across these without custom one-off reads.

Recommended tables:
- `performance_snapshots`
- `intelligence_insights`
- `agent_memory`
- `debug_events`

### Gap 2: Learning Is Mostly Recent Prompt Context

Current learning pattern:
- store feedback
- load last 3-5 corrections
- paste them into the next prompt

Better pattern:
- store feedback
- summarize repeated patterns into brand/agent memory
- attach memory to prompts
- track whether the memory improved outputs

### Gap 3: Prediction Fields Exist But No Prediction Engine Exists

Schema has `predicted_score`, but no implemented path fills it.

The first prediction engine should be simple and transparent:
- baseline score from AI quality score
- adjustment from historical template/format/channel performance
- penalty for gate warnings
- boost for similar past winners
- confidence based on sample size

### Gap 4: Intelligence UI Overpromises

Settings says the intelligence layer learns automatically from every video and editorial decision. That is aspirational, not fully true yet.

Recommendation:
- Replace promise language with a real Intelligence dashboard that shows:
  - data captured
  - active signals
  - learned insights
  - pending recommendations
  - inactive modules and why

### Gap 5: Agent Tools Are Stubbed

These files are explicit placeholders:
- `src/lib/ai/tools/db-read.js`
- `src/lib/ai/tools/audit-read.js`
- `src/lib/ai/tools/write-insight.js`
- `src/lib/ai/tools/web-search.js`

This is the cleanest path to the next intelligence layer. They were designed for exactly this, but are not wired.

## Recommended Build Order

### Phase 1: Intelligence Audit Dashboard

Goal: make the invisible intelligence layer visible.

Status: shipped in v3.18.3.

Build:
- New Intelligence view inside Settings.
- Show modules: Research, Quality Gate, Calendar, Production Agents, Performance, Prediction, Durable Memory, Diagnostics.
- For each module shows:
  - status: active / partial / stub / missing
  - data source
  - signal count
  - detail
  - biggest gap
- Replace current generic Settings Intelligence copy with real status.

Why first:
- It will stop the app from overpromising.
- It gives us a control surface for future intelligence.
- It helps debugging and SaaS onboarding.

### Phase 2: Intelligence Insights Table

Goal: create the durable memory layer.

Add `intelligence_insights`:
- `id`
- `created_at`
- `workspace_id`
- `brand_profile_id`
- `source`
- `category`
- `entity_type`
- `entity_id`
- `summary`
- `payload`
- `confidence`
- `status`

Then implement `write-insight.js`.

First insight producers:
- agent feedback summarizer
- performance pattern summarizer
- provider/debug failure summarizer
- quality gate recurring issue summarizer

### Phase 3: Performance Snapshots

Goal: stop using `stories` as the only analytics store.

Add `performance_snapshots`:
- `story_id`
- `workspace_id`
- `brand_profile_id`
- `channel`
- `captured_at`
- `views`
- `completion_rate`
- `watch_time`
- `likes`
- `comments`
- `shares`
- `saves`
- `follows`
- `cost_estimate`
- `raw_source`

Then keep story metrics as latest cached values.

Why:
- Enables time-series learning.
- Supports non-social deliverables later.
- Makes SaaS analytics more credible.

### Phase 4: Prediction Engine V1

Goal: make `predicted_score` real.

Implement a transparent local scorer:
- AI score base.
- Template/format historical performance adjustment.
- Channel/platform adjustment.
- Gate warning/blocker penalty.
- Similar-content performance adjustment.
- Sample-size confidence.

Write back:
- `predicted_score`
- `metadata.prediction`

Display:
- Pipeline
- Calendar auto-fill
- Detail
- Insights score tab

### Phase 5: Agent Tooling

Goal: turn the agent from chat assistant into system analyst.

Implement:
- `db-read`
- `audit-read`
- `write-insight`
- a safe tool dispatcher for the in-app agent

First agent skills:
- "Why is this broken?"
- "Why did this content underperform?"
- "What should we produce next week?"
- "What did I keep editing in production briefs?"

### Phase 6: Debug Agent

Goal: connect Diagnostics to solutions.

Build:
- persistent `debug_events`
- client error boundary logging
- API route health checks
- diagnostic bundle ingestion
- Debug Agent panel with suggested fixes

This should come after `intelligence_insights`, because debug findings should become reusable memory.

## Priority Recommendations

1. Build the Intelligence Audit Dashboard next.
2. Add `intelligence_insights` and implement `write-insight`.
3. Add `performance_snapshots`.
4. Make `predicted_score` real.
5. Wire safe agent tools.
6. Build the Debug Agent on top of the same memory/log substrate.

## Highest Risk Bugs / Mismatches

### 1. Intelligence Settings Copy Overstates Reality

The UI says the system automatically learns from every video and decision. Today it captures some data and uses recent correction snippets, but it does not yet learn durable patterns.

Fix: replace with module status dashboard.

### 2. Agent API Provider Config Is Not Tenant-Correct

The agent API loads LLM provider keys using `NEXT_PUBLIC_DEFAULT_BRAND_PROFILE_ID`, not the active tenant. That can break SaaS tenant isolation once multiple brands configure their own LLM keys.

Fix: pass active `brand_profile_id` to `/api/agent` and use it in provider lookup after validating membership.

### 3. Agent Tools Exist But Throw

The codebase has tool schemas for DB read, audit read, write insight, and web search, but all throw `not implemented`.

Fix: implement these before calling the app a true agentic system.

### 4. Score Story Is Still Narrative-Biased

`score-story` uses emotional depth, obscurity, visual potential, and hook strength for every content type. That is good for Uncle Carter narrative videos, weak for ads/product/publicity.

Fix: template-specific scoring profiles.

### 5. Calendar Ranking Is Too Simple

Auto-fill uses score plus reach score. It ignores historical channel/day performance, template goals, campaigns, and prediction confidence.

Fix: use Prediction Engine V1 as Calendar's ranking source.

## Definition Of Done For A Real Intelligence Layer

The intelligence layer is real when:

- Every important event becomes a structured signal.
- Signals produce durable insights.
- Insights are visible, explainable, and dismissible.
- Predictions are calculated and stored.
- Recommendations cite the evidence behind them.
- Agents can read approved memory and logs through scoped tools.
- Debug findings become reusable knowledge.
- The system improves Research, Calendar, Quality Gate, and Production without the user manually re-teaching it each time.

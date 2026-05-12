# Content Pipeline — AI Agent Context

## Current Version
- App badge/package target: v3.37.3
- Repo: `peek15/uc-pipeline`
- Push to `main` when work is complete; Vercel auto-deploys.
- Always run `npm run build` before committing.

## Product
Next.js 14 SaaS-ready content pipeline web app. The default seeded workspace
is Uncle Carter, but active product work should be brand-agnostic. The app manages content research, approvals, scripts, production assets,
scheduling, provider operations, quality gates, and analytics.

## Creative Engine UI Direction (v3.30.0+)
- Creative Engine is not Uncle Carter. Do not use Uncle Carter, NBA, sports, clock, pocket-watch, or storytelling-specific metaphors as generic product identity.
- UI should feel calm, premium, source-aware, and operational: agentic without gimmicks, B2B-trustworthy, and low-noise.
- Reference principles: Claude/Codex for agentic workflows and review, Linear for operational clarity, Stripe for trust/compliance copy, VS Code for workspace control, ChatGPT/Codex for on-demand source review.
- Typography direction: Instrument Sans for main UI; IBM Plex Mono or a sober mono fallback for metadata/numbers.
- Visual system should be 90-95% neutral with minimal accent. Use color only for state, focus, selection, warning, approval, or rare highlights.
- Avoid AI gradients, rainbow effects, colorful clutter, decorative animation, and prototype-style oversized UI.
- Use skeletons/shimmer for loading structure, WorkTrace/steppers for high-level agentic work, generating cards for pending structured outputs, and streaming only where genuinely supported.
- Avoid progress bars except for real file upload progress with a true percentage.
- Sources/work review should be on demand via small affordances like "View sources", "Review work", or "Used sources"; never fake sources. Mark inferred and uncertain items clearly.
- Home should feel already operational: controlled reveal is acceptable, but no system boot copy, no WorkTrace by default, and no progress bar.
- Target navigation direction: Home, Strategy, Ideas, Pipeline, Create, Calendar, Analyze. Settings stays separate in the avatar/lower sidebar.
- Analyze V1 is transparency and workspace learning signals, not overpromised predictive intelligence.
- Keep one assistant system. Do not create a second assistant panel or scattered AI buttons.

## App Shell / Navigation Direction (v3.31.0+)
- Target primary navigation is Home, Strategy, Ideas, Pipeline, Create, Calendar, Analyze. Avoid route-key rewrites unless a migration is explicitly planned.
- Home is a cockpit for readiness, next action, work in progress, approvals, export readiness, and workspace signals. It is not an analytics dashboard.
- Home should use controlled reveal/skeletons where useful, not WorkTrace by default, boot copy, progress bars, or engine metaphors.
- Strategy is the product surface for Brand Profile, Content Strategy, Programmes, and risk/claims guidance.
- Settings remains admin/technical configuration: workspace, members, billing, privacy/data, providers, rules, account, appearance, and advanced edits.
- Ideas is the client-facing direction for the old Research surface; keep internal `research` keys stable until a deliberate migration.
- Create is the current production/script surface; do not split it into new agents or panels.
- Analyze V1 is transparency and workspace learning signals, not overpromised ML or predictive intelligence.
- Campaigns is legacy planning/to reposition unless explicitly developed; do not make it the center of the product promise.
- Do not use UC visual metaphors for Creative Engine.

## Conversational Onboarding Direction (v3.32.0+)
- Onboarding is full-screen and conversation-first. It should feel closer to Claude/Codex than a SaaS form.
- Source-first intake happens inside the conversation: website URLs, files, pasted notes, and manual answers.
- Use WorkTrace/generating cards for high-level task progress. Do not expose chain-of-thought.
- Sources/work review are on demand, not automatically displayed everywhere.
- Never fake source analysis. PDF/images must be marked pending if they are not actually parsed.
- User approval is required before saving final Brand Profile, Content Strategy, Programmes, risks, or first ideas.
- After approval, guide users to Strategy/Home/Ideas/Create; do not strand them on onboarding.
- Do not show the right-side AgentPanel during onboarding.
- Do not use UC visual metaphors in onboarding.

## Streaming Smart Onboarding (v3.37.3+)
- Onboarding is now an agentic conversation surface, not a questionnaire. Preserve the Claude/ChatGPT-like message stream and bottom composer.
- Shared onboarding orchestration lives in `src/lib/onboardingAgentStep.js`; keep streaming and non-streaming onboarding routes using this shared module so behavior does not drift.
- Streaming route: `/api/onboarding/agent-stream`. Non-streaming compatibility route: `/api/onboarding/chat`. Agent-step alias: `/api/onboarding/agent-step`.
- Session memory route: `/api/onboarding/memory`. Persisted memory requires `supabase-sprint10-onboarding-agent-memory.sql`.
- New table: `onboarding_agent_memory` stores user turns, assistant turns, tool calls, sources, and agent-state snapshots. Do not store raw provider secrets, base64 media, or unnecessary full raw documents there.
- Tool cards should show high-level work artifacts: source URL, extracted fields, confidence, missing fields, limitations. They must not expose chain-of-thought.
- The agent should dynamically choose the next action: ask for source, ask clarification, review understanding, or draft setup pass. Avoid hardcoded form gates.
- Web lookup is limited official-source assistance only. Do not describe it as competitor research, market intelligence, social scanning, or exhaustive crawling.
- PDF/images remain stored/pending unless real parsing is implemented. Never claim they were analyzed when they were not.
- User approval remains mandatory before saving Brand Profile, Content Strategy, Programmes, Risk/Claims Guidance, or first ideas.

## Stack
- Next.js 14 App Router
- Supabase auth/db/storage
- Google OAuth sign-in is open to Google accounts; workspace access is gated by `workspace_members` RLS.
- Anthropic and OpenAI agent/chat support
- Provider abstraction for LLM, voice, visual, licensed image, and storage services

## Critical Rules
- Keep all React hooks above early returns.
- Use existing local patterns before adding new abstractions.
- Use CSS variables for colors and typography.
- Version bump `src/app/page.js`, `package.json`, and `package-lock.json` before push.
- Do not expose provider secrets in the browser; credentials live in `provider_secrets` and server routes use the service role.
- Do not remove user/local changes unless explicitly requested.

## Brand Strategy (v3.26.0+)
- Brand Profile, Content Strategy, and Programmes are the core Creative Engine control center.
- Brand strategy fields live in `brand_profiles.settings` JSONB — no separate tables. See `supabase-sprint5b-brand-strategy.sql` for shape.
- `brandConfigForPrompt(settings)` in `src/lib/brandConfig.js` produces the full prompt-safe brand config — use it in all AI prompts.
- Generic clients must not inherit Uncle Carter/NBA defaults. UC's saved DB values override generic defaults via `mergeSettings()`.
- UC-specific constants (`UC_TEAMS`, `UC_RESEARCH_ANGLES`, `UC_SCRIPT_SYSTEM`) remain in `src/lib/constants.js` as explicit named exports — do not delete them.
- Programmes are recurring content series/editorial lanes, not one-off posts. Each programme can be enabled/disabled (`active` field).
- Strategy/advisory AI help must route through the existing right-side assistant panel via `openAssistant(buildAgentContext({...}))`.
- Do not add scattered AI audit/strategy/suggestion buttons. Use generic "Ask assistant" entry points that call `openAssistant(ctx)`.
- Task types `improve_brand_profile`, `suggest_content_pillars`, `suggest_programmes`, `suggest_campaign_ideas`, `suggest_content_ideas` all use `cost_center: "strategy_advisor"`.
- Do not implement Studio or intelligence layer automation unless explicitly instructed.

## Smart Onboarding (v3.27.0+)
- Onboarding is a full-screen smart wizard at `/onboarding`, not the right-side assistant panel.
- It is triggered for new or incomplete workspaces/brand profiles and can be re-run manually from Settings.
- It uses the same assistant/orchestration concepts (`task_type`, `agent_context`, `workspace_id`, `brand_profile_id`, `cost_center`, `cost_category`) but does not create a second backend agent.
- Source-first onboarding is preferred over static questionnaires: infer from user-provided URLs, files, notes, and manual answers, then ask only missing clarifications.
- Show uncertainty and ask for confirmation instead of hallucinating. Do not fake PDF/image/website analysis.
- User approval is required before writing drafts to final Brand Profile, Content Strategy, Programmes, and recommendations.
- Do not force Drive, S3, GCS, or bucket/asset-library connection upfront.
- Data privacy hardening follows onboarding; keep Sprint 6 privacy copy lightweight.

## Privacy / Data Protection (v3.28.0+)
- Data classes are centralized in `src/lib/privacy/privacyTypes.js`: D0 public, D1 business standard, D2 confidential, D3 sensitive, D4 secret.
- Privacy modes are `standard`, `confidential`, `enhanced_privacy`, and `enterprise_custom`.
- D4 secrets must never be routed to AI/media providers. D2/D3 must be blocked from standard or unknown-retention providers unless an approved no-retention/client-owned route is configured.
- Provider privacy assumptions live in `src/lib/privacy/providerPrivacyProfiles.js`; unknown retention is never treated as safe for confidential/sensitive data.
- AI/provider calls should use the privacy gateway/minimization helpers before provider execution and log metadata only: data class, privacy mode, provider profile, operation, cost fields, payload hash, and sanitized errors.
- Do not store raw prompts, raw model responses, raw uploaded document text, base64 media, provider request bodies, provider response bodies, or provider secrets in logs by default.
- Prompt minimization and redaction are rule-based for now; preserve utility, redact obvious secrets/PII, truncate large payloads, and send selected snippets rather than whole files.
- Privacy Settings are owner/admin writable only. Editor/viewer may read current mode if workspace policy allows.
- Export/delete routes are request/manifest scaffolds only; destructive deletion requires a separate reviewed job.

## Compliance / Approval / Export (v3.29.0+)
- Creative Engine compliance checks are warnings and workflow support, not legal advice or guarantees.
- Users remain responsible for final review, claims, asset rights, publication, advertising use, and legal/platform compliance.
- Do not add mandatory Peek Media human review by default.
- High-risk warnings requiring acknowledgement must be acknowledged before approval/export.
- Approval and export events must be workspace-scoped and logged in the Sprint 8 compliance tables.
- AI help for compliance must route through the existing assistant panel with `task_type` and structured context.
- Do not create separate AI compliance panels or scattered AI rewrite/audit buttons.
- Use Sprint 7 privacy helpers and safe logging for compliance tasks. Do not log raw full content unnecessarily.
- Do not implement publishing automation unless explicitly requested.

## Agent Architecture (v3.25.0+)
- One right-side assistant panel only. No second panel, no scattered AI flows.
- `AssistantContext.Provider` wraps the app in `page.js`. Use `useAssistant().openAssistant(ctx)` from any component.
- `buildAgentContext({task_type, source_view, ...})` in `src/lib/agent/agentContext.js` builds typed context.
- Task types and capabilities are internal — `src/lib/agent/taskTypes.js`. Users see one assistant.
- `/api/agent` extracts `task_type` from POST body and logs `cost_center`/`cost_category` to `ai_calls`.

## Recent Updates
- v3.18.6: Performance snapshot foundation: `performance_snapshots` table added to schema, manual metric saves and Metricool CSV imports write time-series rows through `src/lib/performance.js`, Settings Intelligence shows snapshot count, and Provider Diagnostics probes the table.
- v3.18.5: Intelligence insights review loop: Settings Intelligence now lists recent `intelligence_insights`, supports reviewed/dismissed status updates, and can scan recent `agent_feedback` corrections into safe feedback-pattern insight rows.
- v3.18.4: Intelligence Phase 2 foundation: `intelligence_insights` table added to `supabase-schema.sql`, `write-insight` tool implemented as a safe scoped insert helper, Settings Intelligence reads insight counts, and Provider Diagnostics probes the new table.
- v3.18.3: Intelligence Phase 1 dashboard in Settings: replaces aspirational copy with live module status for Research, Quality Gate, Calendar, Production Agents, Performance, Prediction, Durable Memory, and Debug intelligence; shows signal counts, maturity, readiness, and next build steps.
- v3.18.2: Provider Diagnostics tab: schema probes, provider health issue summary, recent AI failure summary, client/app context, copy-for-agent text, and redacted JSON debug bundle export for support/agent troubleshooting. Provider secrets must never be included in diagnostics output.
- v3.18.1: Template-specific Quality Gate profiles: narrative, ad, publicity, product, educational, community, and generic content now use different checks for objective/audience/channel/deliverable/factual anchor/CTA/proof/news value/teaching point/participation prompt; gate output includes profile/template metadata.
- v3.18.0: Deeper content-agnostic Create workflow: selected template workflow steps now drive the Create step list/progress/review; non-video templates can omit voice/visual/assembly steps; custom workflow steps render as notes/checkoff panels; generate-script now adapts copy/script output to the selected template.
- v3.17.9: Research/Create production now use content templates: Research can target a template and saves `content_template_id` plus type/objective/audience/channel/deliverable metadata; Detail can edit the template; Create shows template fields/workflow; brief and assembly agents receive template context.
- v3.17.8: Onboarding can now propose distinct content templates from brand memory/current settings, dedupe them against existing templates, and save them into `settings.strategy.content_templates`; Settings exposes a manual template editor.
- v3.17.7: Content-agnostic metadata foundation: `stories` rows now support content type, objective, audience, channel, campaign, and deliverable fields; Pipeline is labeled Content with new filters/search; Detail and CSV import/export preserve those fields.
- v3.17.6: Programme color correction and content-agnostic audit: story queue left bars now use programme/format colors across Create, Produce, and Calendar; added `docs/content-agnostic-audit.md`.
- v3.17.5: Phase 5 workspace/brand selector foundation: active tenant persists in UI storage, sidebar brand selector lists profiles in the workspace, new brand creation clones current settings into a fresh brand profile, and story/settings reloads follow the selected brand.
- v3.17.4: Seed-preserving cleanup: app now prefers `brand_profiles.settings` JSONB while reading legacy `brief_doc`, Settings saves both formats safely, schema seeds/migrates Uncle Carter settings so no re-onboarding is required, and legacy Write/Settings components were cleaned to use configured language/script helpers.
- v3.17.3: SaaS Phase 4 brand-facing hardening: dynamic app chrome, generic login/metadata copy, configured-language CSV import/export, dynamic story/detail readiness, generic Airtable subject/script fields, and settings workspace copy cleanup.
- v3.17.2: SaaS Phase 3 brand-agnostic workflow layer: scripts JSONB adapter, configured-language Create/Produce/Calendar readiness, brand-aware quality gate terms, agent prompt subject language, and generic pipeline agent context.
- v3.17.1: SaaS Phase 2 brand-config engine: brand taxonomy helper, brand-aware Research prompt/options, brand-aware script/scoring/translation/reach prompts, taxonomy/prompt defaults in settings.
- v3.17.0: SaaS Phase 1 tenant foundation: workspace tables/RLS scaffold, tenant-scoped story reads/writes, tenant-scoped settings/provider/assets/AI usage wiring.
- v3.16.9: Create V2 unified workflow: shared story queue, persistent selected-story workspace, Script-to-Review step tabs, and smoother Write/Produce transition.
- v3.16.8: Create mode switcher harmonized; Shift+Option/Alt+Arrow switches Write/Produce inside Create.
- v3.16.7: Create tab merges Write and Produce modes; Calendar auto-fill shortcut remapped to Option/Alt+P.
- v3.16.6: Phase 2 UI interactions: Calendar drag/drop scheduling, auto-fill plan preview, and Produce agent-step tabs.
- v3.16.5: Phase 1.5 UI convergence: shared page headers/buttons/panels across Stories, Write, Insights, and Providers.
- v3.16.4: Phase 1 UI audit upgrades: shared operational UI primitives, Calendar planner board, Produce queue filters/readiness strip.
- v3.16.3: Provider cost alerts in AI Usage using rolling ai_calls cost estimates and persisted local budgets.
- v3.16.2: Quality Gate V2 deeper checks, gate score, info issues, and Pipeline re-audit visible stories.
- v3.16.1: Calendar weekly planner audit, safe auto-fill, quality/scripting/sequence planning flags.
- v3.16.0: provider/agent finish-up, LLM provider keys, next/font typography cleanup, agent write actions.
- v3.15.3: AI usage CSV export and Quality Gate V2 foundation.
- v3.15.2: provider usage charts.
- v3.15.1: provider operations overview and lighter dark-mode text.
- v3.15.0: agent panel right drawer.

## Provider Section
- Component: `src/components/ProvidersSection.jsx`
- Tabs: Overview, Configure, Health, AI Usage, Diagnostics.
- Provider config is stored through `src/app/api/provider-config/route.js`.
- Supported provider types include:
  - `llm_openai`
  - `llm_anthropic`
  - `voice`
  - `visual_atmospheric`
  - `visual_licensed`
  - `storage`
- AI Usage supports charts, CSV export, and local budget alerts:
  - raw calls: `uc-ai-calls.csv`
  - summary: `uc-ai-usage-summary.csv`
- Cost alerts are based on `ai_calls.cost_estimate`; direct provider billing sync is provider-specific and not universally available.
- Diagnostics runs client-side Supabase schema probes against key SaaS tables/columns, summarizes provider and AI call failures, and exports a redacted debug bundle. Keep it useful for the in-app agent, but do not add raw keys, env values, provider secret JSON, full user lists, or unnecessary story/script content.
- Intelligence-layer audit and recommended roadmap live in `docs/intelligence-layer-audit.md`.
- Durable intelligence findings should go to `intelligence_insights` through `src/lib/ai/tools/write-insight.js`; never let an agent mutate strategy/scoring/content directly when a reviewable insight row is enough.

## SaaS Tenancy
- Tenant helper: `src/lib/brand.js`
- Active tenant shape: `{ workspace_id, brand_profile_id }`.
- Active tenant is persisted under `uc_ui_active_tenant`; the sidebar brand selector updates it.
- Default fallback IDs remain `00000000-0000-0000-0000-000000000001` for the existing Uncle Carter workspace.
- Story DB helpers in `src/lib/db.js` now accept tenant context and inject/scope `workspace_id` + `brand_profile_id`; they also default missing `content_type` to `narrative`.
- `supabase-schema.sql` includes Phase 1 workspace tables, `workspace_members`, `is_workspace_member()`, tenant indexes, and transitional RLS policies.
- The default workspace is intentionally migration-compatible; generated future workspaces should require membership policies only.
- The default Uncle Carter brand profile is inserted/upgraded into the newer `brand_profiles.settings` JSONB shape; do not force existing users through onboarding again.

## Brand Config Engine
- Helper: `src/lib/brandConfig.js`
- Uncle Carter values are now treated as seed defaults, not the only product model.
- Load settings from `brand_profiles.settings` first; `brief_doc` is legacy fallback and may be a JSON string.
- Script language access should go through `getStoryScript()`, `storyScriptPatch()`, `hasAllConfiguredScripts()`, and `getBrandLanguages()`.
- `storyScriptPatch()` writes legacy columns only for EN/FR/ES/PT and writes every language to `stories.scripts` JSONB for SaaS brands with custom language sets.
- Brand settings can provide:
  - `strategy.programmes`
  - `taxonomy.eras`
  - `taxonomy.subjects`
  - `taxonomy.research_angles`
  - `prompts.script_system`
  - brand voice/avoid/locked closing line
- Research uses brand programmes/archetypes/subjects and passes `brand_config` into research/scoring prompts.
- Create script generation and translation pass `brand_config` into AI prompts.
- Reach/script/scoring/translation prompts should prefer `brand_config` over UC defaults.
- Production voice and assembly agents now read legacy script columns plus `stories.scripts`.
- Calendar language readiness and Production Alert translation warnings use configured brand languages.
- App chrome, CSV import/export, detail readiness, and story list readiness should use `getBrandName()`, `subjectText()`, `getBrandLanguages()`, and `getStoryScript()` instead of hardcoded UC/player/FR-ES-PT assumptions.
- Story/card left bars are operational programme indicators and should use programme/format color, not emotional archetype color.
- Content-agnostic audit lives in `docs/content-agnostic-audit.md`.
- Content rows can now carry `content_type`, `objective`, `audience`, `channel`, `campaign_id`, `campaign_name`, and `deliverable_type`. Keep new UI copy content-first, while preserving table/agent compatibility until a deeper migration is planned.
- Content templates live in `settings.strategy.content_templates`. Onboarding receives current templates plus brand-memory summaries and should only propose a new template when it differs meaningfully in content type, objective, audience, channel, deliverable, required fields, or workflow.
- Research should pass the selected template into `research-stories`; generated content should save `content_template_id` and template-derived metadata. Production agents should read the story template before generating visual briefs or assembly plans.
- Create workflows are template-driven through `settings.strategy.content_templates[].workflow_steps`. Known tokens map to existing tools (`script/copy`, `translations`, `brief`, `assets`, `visuals`, `voice`, `assembly`, `review`); unknown tokens become custom note/checkoff steps stored under `story.metadata.template_progress`.
- Quality Gate profiles live in `src/lib/qualityGate.js` and are selected from the story's assigned content template/content type. Do not judge ad/publicity/product/educational/community content with narrative-only requirements.

## UI System
- Shared operational primitives live in `src/components/OperationalUI.jsx`.
- Use these for new tab-level work before hand-rolling local headers, panels, stat cards, pills, or button styles.

## Create
- Component: `src/components/CreateView.jsx`
- Create V2 uses one shared left queue and one selected-story workspace.
- Steps: Draft, Translations, Brief, Assets, Voice, Visuals, Assembly, Review.
- Shift+Option/Alt+Left/Right moves across Create steps.
- Option/Alt+Up/Down moves between queued stories.
- `[[nav:script]]` opens Create near writing; `[[nav:production]]` opens Create near production for backward compatibility.

## Operational Surface Direction
- Pipeline should be a calm operational list of content items, stages, blockers, and next actions.
- Pipeline should hide excessive metadata by default; long tags, scores, raw fields, source/audit detail, and UC-specific metadata belong in expanded rows or detail views.
- Create is the current production surface: draft, edit, check, approve, and export. Do not turn it into Studio unless explicitly requested.
- Calendar is a planning and readiness surface, not publishing automation or platform API scheduling.
- Analyze is workspace signals and operational transparency, not predictive ML, market intelligence, or guaranteed optimization.
- Generic Creative Engine UI should avoid Uncle Carter, NBA, sports, clock, pocket-watch, and storytelling-specific metaphors unless scoped to the UC profile/data.
- Use skeletons/shimmer for structural loading, WorkTrace for AI task progress, generating cards for drafts/insights/compliance/export, and loading buttons for actions.
- Avoid progress bars except true file upload progress with a real percentage.
- Source/work review should stay on demand through review/source affordances; never fake sources or work traces.
- AI help must route through the existing assistant panel and structured context. Do not create new visible agents or scattered AI buttons.

## Sprint 10A Sobriety Rules
- Creative Engine UI should be more sober than colorful: default surfaces are neutral, with color reserved for active navigation, primary action, real warnings, approval/compliance state, focus, and rare emphasis.
- Default non-critical pills, tags, programme labels, and metadata should be neutral. Do not color every programme, tag, status, or metadata item by default.
- Home is a calm cockpit for next action, readiness, and attention, not a dashboard or analytics surface.
- Strategy is the primary editable surface for Brand Profile, Content Strategy, Programmes, and Risk/Claims Guidance.
- Settings is admin/technical configuration. If strategy mirrors remain there, present them as compatibility/admin fallback, not the main strategy workflow.
- Create may use subtle readiness/progress bars only for real production completeness. Progress bars remain avoided elsewhere except true file uploads with real percentage.
- Calendar should be planning/readiness with secondary or collapsed audit detail, not an audit board.
- Analyze remains Workspace signals and early deterministic transparency, not advanced analytics.
- Avoid UC-specific visual language in generic UI.
- Do not add new AI buttons or a second assistant surface.

## Sprint 10B Pipeline Display Preference
- Pipeline display density is an Appearance preference, not a brand/workspace strategy setting.
- Allowed modes are `essential` and `detailed`; default is `essential`.
- Persist the preference as a user/interface setting. Use `ce_pipeline_display_mode` localStorage unless a clean user preferences system exists.
- Do not store Pipeline display density in `brand_profiles`, workspace settings, or strategy JSON.
- Essential mode hides detailed AI scoring, reach/community signals, tags, and internal metadata from the default Pipeline row.
- Detailed mode may show AI scores and useful metadata, but must remain visually sober.
- This setting must never change scoring, ranking, generation, API calls, database fields, or saved content data.
- Keep progress/readiness bars only where they represent real readiness, especially in Create.

## Sprint 10C Agentic Onboarding and Create Simplification
- Onboarding must feel like an agent conversation, not a form, HR intake, or job application flow.
- Gather onboarding inputs through chat-like turns, source chips, attachment actions, and dynamic cards; avoid showing all website/manual/platform inputs at once.
- Use WorkTrace only for high-level task progress while the system is actually working. Do not expose chain-of-thought, fake source analysis, or timestamp-heavy logs.
- PDF and image uploads may be stored, but must be marked pending if they are not actually parsed.
- Approval is still required before saving final Brand Profile, Content Strategy, Programmes, or Risk/Claims Guidance.
- Create should foreground campaign/programme context, content item title, current stage, next action, and real readiness first.
- UC/emotional archetype metadata must not dominate generic Creative Engine UI; move internal metadata to Details, Advanced metadata, Review work, Detailed display mode, or profile-specific UI.
- Use Claude/VS Code-like micro-interactions: subtle hover, active, focus-visible, row/card highlighting, and secondary action reveal.
- Do not add decorative motion, glow, bounce, gradients, large lift, animated AI effects, a second assistant panel, or scattered AI buttons.

## Agent Panel
- Component: `src/components/AgentPanel.jsx`
- API route: `src/app/api/agent/route.js`
- The agent can use Anthropic or OpenAI depending on configured provider keys.
- LLM keys are resolved from Supabase `provider_secrets` first, then env vars.
- The agent receives pipeline context, 7-day AI usage metrics, and recent stories.
- Supported action tags:
  - `[[nav:tab]]`
  - `[[story:STORY_ID]]`
  - `[[approve:STORY_ID]]`
  - `[[reject:STORY_ID]]`
  - `[[stage:STORY_ID:STATUS]]`

## Quality Gate
- Core logic: `src/lib/qualityGate.js`
- Research runs the gate before adding stories to Pipeline.
- Quality Gate V2 accepts brand-specific factual anchor terms at `settings.quality_gate.factual_anchor_terms`.
- PT review warnings only apply when Portuguese is a configured brand language and the PT script exists.
- Gate state persists on `stories` via:
  - `quality_gate`
  - `quality_gate_status`
  - `quality_gate_blockers`
  - `quality_gate_warnings`
  - `quality_gate_checked_at`
- Pipeline has a Quality filter: Passed, Warnings, Blocked, Not audited.
- Detail modal has a Re-audit action.
- Pipeline has Re-audit visible to refresh gate state across filtered stories.
- Gate issues can include blocker, warning, or info severity plus category metadata.

## Calendar Planner
- Component: `src/components/CalendarView.jsx`
- Shows a planner-board week view, 3-week coverage, and a weekly planner audit for the visible week.
- Audit checks:
  - missing cadence slots
  - quality gate warnings/blockers/missing audits
  - scheduled content items missing drafts
  - format mix gaps
  - sequence-rule issues
- `Auto-fill safe` avoids Quality Gate blocked content.

## Production
- Component: `src/components/ProductionView.jsx`
- Uses a left production queue plus selected-story agent workspace.
- Queue filters include all, needs brief, needs assets, needs voice, needs assembly, and ready review.
- Selected stories show a readiness strip for brief, assets, voice, visuals, and assembly.

## Supabase
- Canonical schema file: `supabase-schema.sql`
- Audit-only helper file: `supabase-audit-log.sql`
- Important tables:
  - `stories`
  - `audit_log`
  - `ai_calls`
  - `provider_secrets`
  - `brand_profiles`
  - `story_documents`
  - `asset_library`
  - `visual_assets`
  - `agent_feedback`
  - `intelligence_insights`
  - `performance_snapshots`

## Typography/UI
- Fonts are loaded through `next/font` in `src/app/layout.js`.
- Typography tokens live in `src/app/globals.css`.
- Current font intent:
  - UI/body: DM Sans
  - metadata/numeric: system monospace
  - editorial: Instrument Serif
  - script text: Georgia fallback stack
- Dark mode text was lightened for readability.

## Key Files
- `src/app/page.js` — app shell, version badge, tabs, global state.
- `src/app/globals.css` — design tokens, theme, typography.
- `src/app/layout.js` — metadata, viewport, next/font vars.
- `src/components/PipelineView.jsx` — story pipeline and filters.
- `src/components/ResearchView.jsx` — research and story ingestion.
- `src/components/DetailModal.jsx` — story detail and quality re-audit.
- `src/components/ProvidersSection.jsx` — provider operations.
- `src/components/AgentPanel.jsx` — AI assistant drawer.
- `src/lib/ai/audit.js` — `ai_calls` logging and reads.
- `src/lib/qualityGate.js` — quality gate checks and persistence helper.

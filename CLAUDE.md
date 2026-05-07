# Content Pipeline — AI Agent Context

## Current Version
- App badge/package target: v3.17.4
- Repo: `peek15/uc-pipeline`
- Push to `main` when work is complete; Vercel auto-deploys.
- Always run `npm run build` before committing.

## Product
Next.js 14 SaaS-ready content pipeline web app. The default seeded workspace
is Uncle Carter, but active product work should be brand-agnostic. The app manages story research, approvals, scripts, production assets,
scheduling, provider operations, quality gates, and analytics.

## Stack
- Next.js 14 App Router
- Supabase auth/db/storage
- Google OAuth limited to the configured allowed domain
- Anthropic and OpenAI agent/chat support
- Provider abstraction for LLM, voice, visual, licensed image, and storage services

## Critical Rules
- Keep all React hooks above early returns.
- Use existing local patterns before adding new abstractions.
- Use CSS variables for colors and typography.
- Version bump `src/app/page.js`, `package.json`, and `package-lock.json` before push.
- Do not expose provider secrets in the browser; credentials live in `provider_secrets` and server routes use the service role.
- Do not remove user/local changes unless explicitly requested.

## Recent Updates
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
- Tabs: Overview, Configure, Health, AI Usage.
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

## SaaS Tenancy
- Tenant helper: `src/lib/brand.js`
- Active tenant shape: `{ workspace_id, brand_profile_id }`.
- Default fallback IDs remain `00000000-0000-0000-0000-000000000001` for the existing Uncle Carter workspace.
- Story DB helpers in `src/lib/db.js` now accept tenant context and inject/scope `workspace_id` + `brand_profile_id`.
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

## UI System
- Shared operational primitives live in `src/components/OperationalUI.jsx`.
- Use these for new tab-level work before hand-rolling local headers, panels, stat cards, pills, or button styles.

## Create
- Component: `src/components/CreateView.jsx`
- Create V2 uses one shared left queue and one selected-story workspace.
- Steps: Script, Translations, Brief, Assets, Voice, Visuals, Assembly, Review.
- Shift+Option/Alt+Left/Right moves across Create steps.
- Option/Alt+Up/Down moves between queued stories.
- `[[nav:script]]` opens Create near writing; `[[nav:production]]` opens Create near production for backward compatibility.

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
  - scheduled stories missing scripts
  - format mix gaps
  - sequence-rule issues
- `Auto-fill safe` avoids Quality Gate blocked stories.

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

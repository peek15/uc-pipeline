# Uncle Carter Pipeline — AI Agent Context

## Current Version
- App badge/package target: v3.16.1
- Repo: `peek15/uc-pipeline`
- Push to `main` when work is complete; Vercel auto-deploys.
- Always run `npm run build` before committing.

## Product
Next.js 14 web app for Peek Studios' Uncle Carter NBA storytelling pipeline.
The app manages NBA story research, approvals, scripts, production assets,
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
- AI Usage supports charts and CSV export:
  - raw calls: `uc-ai-calls.csv`
  - summary: `uc-ai-usage-summary.csv`

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
- Gate state persists on `stories` via:
  - `quality_gate`
  - `quality_gate_status`
  - `quality_gate_blockers`
  - `quality_gate_warnings`
  - `quality_gate_checked_at`
- Pipeline has a Quality filter: Passed, Warnings, Blocked, Not audited.
- Detail modal has a Re-audit action.

## Calendar Planner
- Component: `src/components/CalendarView.jsx`
- Shows 3-week coverage plus a weekly planner audit for the visible week.
- Audit checks:
  - missing cadence slots
  - quality gate warnings/blockers/missing audits
  - scheduled stories missing scripts
  - format mix gaps
  - sequence-rule issues
- `Auto-fill safe` avoids Quality Gate blocked stories.

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

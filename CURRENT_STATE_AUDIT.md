# Current State Audit — Creative Engine / Uncle Carter Pipeline
**Date:** 2026-05-12  
**Version audited:** 3.37.3  
**Scope:** Current repo state after the streaming smart-onboarding upgrade.

## Executive Summary
- Creative Engine is now a multi-workspace content operations app with Home, Strategy, Ideas, Pipeline, Create, Calendar, Analyze, Settings, onboarding, privacy, compliance, approval, and export foundations.
- The product direction is Creative Engine first. Uncle Carter remains supported as a seeded/profile-specific workspace, but generic UI should not surface UC/NBA/storytelling metaphors by default.
- Onboarding is now the most agentic surface: full-screen, conversation-first, source-aware, streaming-capable, and backed by structured tool traces plus persisted session memory.
- Strategy is the primary editable surface for Brand Profile, Content Strategy, Programmes, and Risk/Claims Guidance. Settings is admin/technical configuration.
- Pipeline has an Appearance preference for Essential/Detailed display density. The preference is UI-only and does not affect scoring, ranking, generation, or saved data.
- Compliance, approval, acknowledgement, and export package flows exist as workflow support. They are not legal guarantees and do not add mandatory Peek Media review.

## Current Navigation
- Home: calm cockpit and next action/readiness surface.
- Strategy: editable Brand Profile, Content Strategy, Programmes, Risk/Claims Guidance, onboarding refresh entry.
- Ideas: client-facing label for the former Research surface; internal route key remains `research`.
- Pipeline: operational list of content items with Essential/Detailed display preference.
- Create: production surface for draft/edit/check/approve/export readiness.
- Calendar: planning/readiness surface, not publishing automation.
- Analyze: workspace signals/transparency, not advanced analytics.
- Campaigns: secondary planning/legacy surface, not a primary Creative Engine promise yet.

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
- Lightweight web lookup lives in `src/lib/onboardingWebResearch.js`.
- Streaming responses are server-sent event style from `/api/onboarding/agent-stream`.
- Agent turns return assistant message, tool calls, agent state, inferred facts, missing fields, confidence, next action, suggested replies, sources used, and draft readiness.
- The UI renders streamed assistant text, tool-call cards, source chips, suggested replies, setup brief memory, WorkTrace, understanding cards, clarification cards, draft cards, and approval.
- PDF/image uploads are not deeply parsed; they must remain marked pending/unsupported unless real parsing is added.
- User approval remains required before writing final strategy/settings.

## Persistence / Supabase
- Sprint 6 onboarding tables remain the foundation:
  - `onboarding_sessions`
  - `onboarding_sources`
  - `onboarding_extracted_facts`
  - `onboarding_clarifications`
  - `onboarding_drafts`
- New migration to apply:
  - `supabase-sprint10-onboarding-agent-memory.sql`
- New table:
  - `onboarding_agent_memory`
- Purpose:
  - Persist user turns, assistant turns, tool traces, source trace metadata, and agent state snapshots.
  - Allow onboarding reload/session recovery.
- Until the migration is applied, onboarding still works, but persisted agent memory is unavailable.

## AI / Agent Architecture
- There is still one normal right-side assistant panel for the main app.
- Onboarding is a full-screen mode powered by the same assistant/orchestration concepts, not a second visible assistant panel.
- AI calls use existing runner/audit patterns.
- Agent tool traces are high-level work records, not chain-of-thought.
- Web lookup is pragmatic and limited; it is not competitor scan, market intelligence, social research, or broad crawling.

## Privacy / Compliance
- Sprint 7 privacy helpers and policy direction still apply.
- Do not log raw full prompts, full model responses, raw uploaded content, provider secrets, or base64 media unnecessarily.
- Compliance checks are warnings/support tools only. Users remain responsible for claims, rights, publishing, advertising, and legal/platform compliance.
- No ZDR/no-retention claims should be made unless verified contractually and technically.

## Build / Validation
- Last validation run:
  - `npm run lint --if-present`: passed
  - `npm run build`: passed
- Current version: `3.37.3`

## Known Remaining Risks
- `supabase-sprint10-onboarding-agent-memory.sql` must be applied before session memory persistence is live in production.
- Streaming depends on the existing Anthropic stream wrapper. If provider streaming fails, the non-streaming/fallback path still returns a response.
- Web lookup quality is basic and should be improved before relying on it for high-stakes brand inference.
- Session memory recovery restores latest active memory but is not yet a full replayable state machine.
- PDF/image understanding is still not implemented.
- Some legacy UC/story metadata may remain in lower-level constants/data paths for backward compatibility; generic UI should keep hiding or scoping it.

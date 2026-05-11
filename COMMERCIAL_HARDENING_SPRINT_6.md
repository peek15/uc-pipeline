# Commercial Hardening Sprint 6 — Smart Onboarding V1

**Version:** 3.27.0  
**Date:** 2026-05-11

## A. Files Changed
- `src/app/onboarding/page.jsx` — full-screen Smart Onboarding wizard.
- `src/app/api/onboarding/session/route.js` — create/list onboarding sessions.
- `src/app/api/onboarding/source/route.js` — source intake records.
- `src/app/api/onboarding/analyze/route.js` — deterministic V1 fact extraction, clarification generation, draft assembly.
- `src/app/api/onboarding/clarification/route.js` — clarification answer persistence.
- `src/app/api/onboarding/approve/route.js` — approval and final strategy write.
- `src/lib/onboarding.js` — shared onboarding status, trigger, scoring, draft, and merge helpers.
- `src/app/page.js` — non-blocking onboarding prompt, query param handling, version bump.
- `src/components/SettingsModal.jsx` — manual Run onboarding / Refresh strategy entry points.
- `src/lib/agent/taskTypes.js` — onboarding task types and cost routing.
- `src/lib/agent/agentContext.js` + `src/lib/agent/modelRouting.js` — onboarding context labels and model tier.
- `supabase-sprint6-onboarding.sql` — onboarding data model and RLS policies.
- `CLAUDE.md` — Sprint 6 onboarding operating rules.
- `package.json` + `package-lock.json` — version bump to `3.27.0`.

## B. Onboarding UX Flow
1. User opens `/onboarding`.
2. Source-first intake asks for website URL, files, notes, and manual answers.
3. “What Creative Engine understood” shows inferred facts and uncertainty.
4. Dynamic clarifications ask only missing or uncertain questions.
5. Draft strategy shows Brand Profile, Content Strategy, Programmes, risk checklist, and first 10 content ideas.
6. User approves before final settings are written.
7. Post-approval CTAs route back to content creation, Pipeline, or Settings.

## C. Data Model / SQL Migration
`supabase-sprint6-onboarding.sql` adds:
- `onboarding_sessions`
- `onboarding_sources`
- `onboarding_extracted_facts`
- `onboarding_clarifications`
- `onboarding_drafts`

RLS uses existing `is_workspace_member()` patterns. Workspace members can read and participate in onboarding for their workspace. Server routes use service role for processing and approval writes.

## D. Trigger Logic
V1 uses a non-blocking app banner when the active brand has no approved onboarding timestamp and lacks core brand/strategy fields. This avoids aggressively blocking existing users.

Settings adds manual rerun entry points:
- Run onboarding
- Refresh strategy

Each rerun creates a new `onboarding_sessions` row.

## E. Source Intake Behavior
Supported intake:
- Website URL
- Upload files
- Paste notes
- Manual answers

V1 parses MD/TXT/text files client-side and stores summaries. PDF/JPG/PNG are accepted as source records but marked pending rather than pretending analysis happened.

Drive/bucket connection is not required. Copy says: “You can connect a full asset library later.”

## F. Source Analysis Behavior and Limitations
Analysis is deterministic in Sprint 6. It uses pasted notes, text files, and manual answers to infer strategy fields.

Limitations shown in the UI:
- Website URLs are stored, but no advanced open-web research runs.
- PDF/image files are accepted but not automatically parsed.
- Uncertain facts are explicitly shown as uncertain.

## G. Clarification Question System
Clarifications are generated only for missing fields:
- priority offer
- audience
- content goal
- platforms
- tone to avoid
- asset rights confirmation

Supported question types:
- single choice
- multi choice
- choice plus other
- free text
- confirmation

“I’m not sure — suggest for me” is supported for useful choice questions.

## H. Draft Strategy and Approval Flow
Drafts include:
- Brand Profile
- Content Strategy
- 3 recommended Programmes
- 2 alternative programme ideas
- Risk / claims checklist
- First 10 content ideas

Approval route writes into `brand_profiles.settings` and `brief_doc` only after “Approve and save to workspace.”

## I. First 10 Content Ideas Behavior
The first 10 ideas are generated as draft recommendations and saved to `settings.strategy_recommendations` after approval. They are not automatically sent to Pipeline in V1.

## J. Assistant / Orchestration Integration
No second backend agent was added. Onboarding uses the same task type/cost concepts:
- `onboarding_analyze_sources`
- `onboarding_generate_clarifications`
- `onboarding_draft_strategy`
- `onboarding_generate_content_ideas`
- `cost_center = onboarding`
- `cost_category = onboarding_agent`

The right-side `AgentPanel` is not present on `/onboarding`.

## K. Privacy Copy Added
Onboarding displays:

“Creative Engine may process the sources you provide with AI providers to draft your strategy. We use commercial AI APIs and will add enhanced privacy controls for sensitive workspaces. Only upload materials you are allowed to use.”

## L. Intentionally Not Implemented
- Advanced open-web research
- Competitor scan
- Market intelligence
- Google Trends / YouTube / TikTok APIs
- Mandatory Drive/bucket connection
- Full asset library
- Studio
- New providers
- Public self-serve pricing, credits, quotas, overages
- CRM
- Automatic PDF/image understanding
- Automatic Pipeline creation from first ideas

## M. Build / Lint Results
- `npm run build` — passed.
- `npm run lint --if-present` — no lint script is defined; command completed without running lint.
- Local dev server smoke check — `/onboarding` returned HTTP 200 and `/` returned HTTP 200.

## N. Manual Test Checklist
- App builds clean.
- `/onboarding` loads full-screen.
- Right-side agent panel is hidden during onboarding because onboarding uses a separate route.
- New or incomplete workspace/brand sees a non-blocking onboarding prompt.
- Website/notes/files/manual intake are accepted.
- MD/TXT files are parsed; PDF/images are honestly marked pending.
- “What Creative Engine understood” appears with uncertainty.
- Clarification questions render and support “I’m not sure — suggest for me.”
- Draft strategy appears.
- Approval writes Brand Profile / Content Strategy / Programmes to settings.
- Settings still opens and includes manual rerun actions.
- Existing Uncle Carter workspace remains on saved DB settings and does not inherit generic defaults.
- Generic workspaces do not inherit UC/NBA defaults.
- Research/Pipeline/Create/Calendar/Analyze/Billing still build.
- No React hook order issues observed in production build.

## O. Remaining Risks
- Supabase migration must be applied before onboarding API routes can persist sessions.
- Website parsing is intentionally not implemented; users must paste relevant text for real analysis.
- PDF/image analysis is pending.
- Clarification persistence is minimal; draft regeneration is currently based on current client answers.
- First ideas remain recommendations, not Pipeline items.

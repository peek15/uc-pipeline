# Workflow / Navigation Audit

## Current Actual Tabs
- `pipeline` shown as Pipeline after Sprint 9A label cleanup. Previously "Content".
- `research` shown as Ideas after Sprint 9A label cleanup. Route/state key remains `research`.
- `create` shown as Create.
- `campaigns` shown as Campaigns.
- `calendar` shown as Calendar after Sprint 9A label cleanup. Previously "Schedule".
- `analyze` shown as Analyze after Sprint 9A label cleanup. Previously "Insights".

Settings remains separate in the lower sidebar/user menu. AgentPanel remains the single assistant surface.

## Current Workflow
1. Onboarding can draft Brand Profile, Content Strategy, Programmes, risks, and first ideas.
2. Settings stores Strategy, Privacy, Billing, Providers, Appearance, and operational configuration.
3. Ideas/Research generates opportunities and can add content items to Pipeline.
4. Pipeline tracks content item state through accepted/new, approved, scripted, produced, published, rejected, and archived.
5. Create handles script/copy and production mode work.
6. Calendar schedules content and can trigger production generation.
7. Detail modal provides quality gate, compliance check, acknowledgement, approval, and export package generation.
8. Analyze shows metrics, performance snapshots, and early workspace learning signals.

## Target Navigation Direction
Home -> Strategy -> Ideas -> Pipeline -> Create -> Calendar -> Analyze

## Target Tab Definitions
Home:
- Answers: "What needs attention now?"
- Shows: workspace readiness, next actions, blockers, recent approvals/exports, onboarding/privacy/compliance readiness.
- Does not show: boot animations, WorkTrace by default, full analytics, static marketing.

Strategy:
- Answers: "What is the system trying to make and why?"
- Shows: Brand Profile, Content Strategy, Programmes, claims/sensitivities, approved strategy status.
- Does not show: raw settings clutter, provider keys, billing.

Ideas:
- Answers: "What should we make next?"
- Shows: source-aware opportunities, suggestions, scoring/rationale, used sources on demand.
- Does not show: UC-specific research framing, static sports taxonomy by default.

Pipeline:
- Answers: "What is in progress and what state is it in?"
- Shows: content items, stage, owner/readiness, quality/compliance status, next action.
- Does not show: every filter as always-visible clutter.

Create:
- Answers: "What are we drafting or producing?"
- Shows: content draft, work trace, structured generation, source review, approval handoff.
- Does not show: separate hidden Script/Production mental models.

Calendar:
- Answers: "What is planned and when?"
- Shows: schedule, cadence health, readiness warnings, production timing.
- Does not show: disconnected planning with no pipeline state.

Analyze:
- Answers: "What signals has the workspace learned?"
- Shows: transparency signals from outputs, approvals, exports, compliance, performance snapshots.
- Does not show: overpromised predictive intelligence or advanced ML claims in V1.

Settings:
- Keeps: account, workspace membership, provider configuration, billing, privacy/data handling, appearance, advanced strategy configuration until Strategy tab exists.

## Recommended Migration Path
Sprint 9B:
- Add Home cockpit shell and Strategy tab placeholder connected to existing Settings sections.
- Keep old route keys where possible to avoid data/state churn.

Sprint 9C:
- Rename Research internally toward Ideas where practical.
- Move Brand Profile / Content Strategy / Programmes from Settings into Strategy tab.
- Simplify Pipeline filter hierarchy.

Sprint 9D:
- Reframe Analyze around transparency and learning signals.
- Add source/work review affordances to Ideas, Onboarding, Create, Compliance, and Export.
- Polish Create as the primary agentic production workspace.


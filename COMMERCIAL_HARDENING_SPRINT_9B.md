# Commercial Hardening Sprint 9B

App shell and navigation coherence.

## A. Files Changed
- `src/app/page.js`
- `src/components/HomeView.jsx`
- `src/components/StrategyView.jsx`
- `src/components/AnalyzeView.jsx`
- `src/components/OperationalUI.jsx`
- `CLAUDE.md`
- `package.json`
- `package-lock.json`
- `APP_SHELL_NAVIGATION_PLAN.md`
- `HOME_STRATEGY_SURFACE_NOTES.md`
- `COMMERCIAL_HARDENING_SPRINT_9B.md`

Sprint 9A files remain part of the current working set:
- `UI_DIRECTION.md`
- `WORKFLOW_NAVIGATION_AUDIT.md`
- `PRODUCT_EXPERIENCE_AUDIT.md`
- `COMMERCIAL_HARDENING_SPRINT_9A.md`

## B. Current Nav Audit
Visible primary nav is now:
- Home (`home`)
- Strategy (`strategy`)
- Ideas (`research`)
- Pipeline (`pipeline`)
- Create (`create`)
- Calendar (`calendar`)
- Analyze (`analyze`)

Campaigns remains available as secondary Planning navigation under its existing `campaigns` key.

Safe relabels are visible-only. The old route keys remain stable where they carry localStorage, shortcuts, assistant routing, or component assumptions.

## C. Home Implementation
Added `HomeView`.

Home V1 includes:
- next action card
- workspace readiness
- content in progress
- needs approval
- ready to export
- published/logged count
- active programmes
- workspace signals
- recent outputs
- quick links to Strategy, Ideas, Pipeline, Create, onboarding refresh, and Settings

Home does not use WorkTrace by default, boot copy, progress bars, or UC/clock/sports metaphors.

## D. Strategy Implementation
Added `StrategyView`.

Strategy V1 is read-oriented and shows:
- Brand Profile summary
- Content Strategy summary
- active/inactive Programmes
- risk/claims/compliance sensitivity summary
- setup status
- Run/refresh onboarding CTA
- Edit in Settings CTA
- Ask assistant CTA through the existing assistant panel
- Review work affordance through Sprint 9A source/work primitives

Editing remains in Settings to avoid duplicating save logic.

## E. Settings Repositioning
Settings still contains Brand Profile, Content Strategy, and Programmes editing. Strategy now serves as the product review surface, while Settings remains the technical/admin/editing surface until components are safely extracted.

Settings remains responsible for workspace/admin configuration, providers, privacy/data handling, billing, appearance, and advanced controls.

## F. Campaigns Audit / Recommendation
Campaigns currently provides campaign planning, deliverables, timeline, and linked content grouping. It overlaps with Programmes, Calendar, and Pipeline.

Sprint 9B did not delete or expand it. It was moved into a secondary Planning section so it no longer dominates the target product navigation.

Future recommendation:
- move Campaigns under Strategy/Planning, or
- develop it as a real feature after Programmes, Calendar, and Reporting mature.

## G. Empty States Added
Home empty states:
- generate/add first ideas
- create/review programmes
- finish strategy setup via Strategy

Strategy empty states:
- run onboarding to create Brand Profile
- edit strategy fields in Settings
- draft programmes
- add risk/claims guidance

All empty states include a next action.

## H. Loading / Reveal States Added
Home and Strategy use simple `anim-fade` controlled reveal. No fake loading or boot copy was added.

Sprint 9A skeleton/loading primitives are available, but Home and Strategy use real data synchronously from existing app state, so skeletons are not shown unnecessarily.

## I. Source / Work Review Affordance
Home and Strategy use `SourceReviewButton` with high-level work steps where source traces are not available. No sources are faked. If a detailed source trace is unavailable, the drawer uses the standard empty message.

## J. Analyze Positioning Notes
Analyze was not redesigned.

Small copy changes were made to reduce overpromising:
- "Intelligence Layer" -> "Workspace signals"
- "Predictive Scoring" -> "Readiness Signals"
- stronger caveats around score/completion correlation
- "published stories" -> "published content items" in one empty state

Full Analyze reframing remains for Sprint 9D.

## K. What Was Intentionally Not Changed
- No full onboarding redesign.
- No deep Pipeline redesign.
- No deep Create redesign.
- No deep Calendar redesign.
- No deep Analyze redesign.
- No Studio V1.
- No publishing automation.
- No new providers.
- No billing features.
- No CRM.
- No final accent color decision.
- No local font files.
- No route-key migration from `research` to `ideas`.
- No removal of Campaigns.
- No movement of Strategy editing out of Settings.

## L. Recommended Sprint 9C / 9D Plan
Sprint 9C:
- Extract Strategy editing components from Settings into Strategy safely.
- Rename Research component copy toward Ideas.
- Add source/work review affordances to Ideas and Onboarding.
- Reduce Pipeline filter clutter with collapsed advanced controls.

Sprint 9D:
- Redesign Create around agentic task flow, generating cards, and review/approval.
- Reframe Analyze around workspace signals, compliance/export history, approvals, and transparent learning.
- Decide Campaigns position after Strategy/Calendar mature.

## M. Build / Lint Results
- Initial Sprint 9B build passed with a lucide warning for an unavailable icon.
- Icon was changed to a supported `Briefcase` icon.
- `npm run lint --if-present` passed with exit code 0.
- `npm run build` passed cleanly.

## N. Manual Test Checklist
- App builds clean.
- App loads.
- Home tab appears and works.
- Strategy tab appears and works.
- Existing Pipeline works.
- Ideas/old Research works.
- Create/old Script works.
- Calendar works.
- Analyze works.
- Campaigns still opens from secondary Planning.
- Settings still opens.
- Brand Profile / Content Strategy / Programmes still save/load through Settings.
- Onboarding still opens.
- Privacy settings still work.
- Billing still works.
- Compliance/Approval/Export still works.
- AgentPanel still works.
- Dark/light mode still works.
- No React hook order issues.
- No broken imports.
- No font loading/build errors.

## O. Remaining Risks
- Vercel font fetch remains unverified. Local build passes with cached/available Google font fetch; fallback plan is fallback-only stack or approved local font migration later.
- Home/Strategy use app-state summaries only; they do not yet preload compliance/approval/export DB rows.
- Strategy is read-oriented and still depends on Settings for edits.
- `research` remains the internal Ideas key.
- Campaigns remains visible as secondary Planning until a product decision is made.
- `SharedUI.jsx` and `OperationalUI.jsx` still overlap.

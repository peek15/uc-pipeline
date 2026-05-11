# Commercial Hardening Sprint 9D

Version: v3.33.0

## A. Files Changed

- `src/app/page.js`
- `src/components/PipelineView.jsx`
- `src/components/CreateView.jsx`
- `src/components/CalendarView.jsx`
- `src/components/AnalyzeView.jsx`
- `src/components/DetailModal.jsx`
- `CLAUDE.md`
- `package.json`
- `package-lock.json`
- `PIPELINE_CREATE_CALENDAR_ANALYZE_AUDIT.md`
- `OPERATIONAL_SURFACES_POLISH_NOTES.md`
- `COMMERCIAL_HARDENING_SPRINT_9D.md`

## B. Pipeline Audit and Changes

Pipeline remains backed by the existing `stories` model and status fields. Sprint 9D did not rename the data model.

Changes:

- Reframed the surface from “Content” to “Pipeline.”
- Added an operational summary for in-progress, ready-to-create, needs-review, ready-to-export, and scheduled counts.
- Added row-level next action language.
- Changed generic filter language from Archetype to Angle.
- Added actionable empty states for no content and no matching filters.
- Reduced reliance on overpromised prediction copy by relabeling expanded-row prediction as a directional signal.

## C. Create Audit and Changes

Create is still the template-driven production surface. The internal `script` workflow key remains for compatibility.

Changes:

- Reframed Create as draft/edit/check/approve/export preparation.
- Changed visible “Script” workspace language to “Draft.”
- Changed “Needs script” to “Needs draft.”
- Added an empty state with a next action back to Pipeline.

## D. DetailModal Audit and Changes

DetailModal remains the main individual content review surface and retains Sprint 8 compliance/approval/export controls.

Changes:

- Updated keyboard hint from “Previous/next story” to “Previous/next content item.”

Postponed:

- Full tabbed DetailModal hierarchy.
- Moving compliance/approval/export into a more prominent Create stage.

## E. Calendar Audit and Changes

Calendar remains a planning board, not publishing automation.

Changes:

- Reframed Schedule as Calendar.
- Header copy now emphasizes approved content, readiness, programme coverage, and cadence.
- Removed the coverage progress bar.
- Replaced script/auto-produce wording with draft preparation wording in key visible states.
- Improved ready-bank and assignment empty states.

## F. Analyze Audit and Changes

Analyze is positioned as workspace signals and operational transparency.

Changes:

- Renamed the page to “Workspace signals.”
- Replaced “intelligence layer” copy with directional/factual copy.
- Added a deterministic “What Creative Engine is learning” card.
- Renamed tabs to avoid overpromising analytics.
- Replaced episode/archetype visible labels with generic content/angle language.

## G. UC-Specific Language Cleanup

Cleaned generic visible labels where low risk:

- Story → content item in selected visible controls.
- Script → draft in Create and Calendar readiness contexts.
- Archetype → angle in Pipeline and Analyze labels.
- Produced/auto-produce language softened where it implied automation.

Postponed:

- Internal database fields and constants.
- UC/profile-specific seed values.
- Keyboard shortcut legacy naming.

## H. Loading/Motion Changes

No new loading architecture was added. Existing sober loading direction from Sprint 9A remains:

- Skeletons/shimmer for structural loads.
- WorkTrace for AI task progress.
- Generating cards for draft/compliance/export work where appropriate.
- Progress bars only for true upload percentages.

Sprint 9D specifically removed a Calendar coverage progress bar because it was not a real upload or measured progress action.

## I. Source/Work Review Changes

No broad new source trace system was added. The existing on-demand source/work review direction remains documented. Detailed source trace should not be shown automatically or faked.

## J. Assistant Integration Changes

No new assistant surfaces or scattered AI buttons were added. Future Pipeline/Create/Calendar/Analyze help should continue to route through `openAssistant(ctx)` and task-specific context.

## K. Privacy/Compliance Consistency Notes

Sprint 9D did not weaken Sprint 7/8 privacy or compliance flows:

- No new raw-content logging was added.
- No legal guarantee language was added.
- No mandatory Peek Media human review was introduced.
- Compliance/approval/export flows remain in existing Sprint 8 surfaces.

## L. What Was Intentionally Not Implemented

- Studio V1.
- Publishing automation.
- Advanced analytics or predictive intelligence.
- Provider integrations.
- Billing features.
- CRM features.
- Deep status/data model rewrite.
- Full Pipeline/Create/Calendar/Analyze redesign.
- Mandatory human review.

## M. Recommended Next Sprint Plan

- Sprint 9E: DetailModal/Create compliance and export hierarchy polish.
- Sprint 9F: Pipeline grouping by programme, approval/export chips, and cleaner row density.
- Sprint 9G: Calendar approval/export gating and readiness filters.
- Sprint 9H: Analyze deterministic compliance/export/cost/workspace signal cards.

## N. Build/Lint Results

- `npm run lint --if-present`: passed/no-op because no lint script is configured in `package.json`.
- `npm run build`: passed on Next.js 14.2.35.

## O. Manual Test Checklist

- Home still works.
- Strategy still works.
- Onboarding still works.
- Ideas still works.
- Pipeline loads and is less cluttered.
- Pipeline empty states work.
- Create loads and is clearer as a production surface.
- DetailModal still opens.
- Compliance check still works.
- Acknowledgement/approval/export still work.
- Calendar loads and has improved empty/readiness states.
- Analyze loads and uses workspace signals framing.
- Settings, Billing, Privacy settings, AgentPanel, and Campaigns secondary Planning section still work.
- No React hook order issues.
- No broken imports.
- No font/build issues.

## P. Remaining Risks

- Some lower-level legacy labels remain because the underlying `stories` model is still in use.
- Create still needs stronger inline compliance/approval/export hierarchy.
- Calendar scheduling is not yet approval/export aware.
- Analyze remains deterministic and only as useful as logged/imported workspace data.
- Existing UC-specific data can still appear when the active workspace/brand contains it, which is intentional for UC support.

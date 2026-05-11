# Commercial Hardening Sprint 10A

Version: v3.34.0

## A. Files Changed

- `CLAUDE.md`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `src/components/HomeView.jsx`
- `src/components/StrategyView.jsx`
- `src/components/SettingsModal.jsx`
- `src/components/OperationalUI.jsx`
- `src/components/CreateView.jsx`
- `src/components/CalendarView.jsx`
- `src/components/PipelineView.jsx`
- `UI_SOBRIETY_AUDIT.md`
- `STRATEGY_EXTRACTION_NOTES.md`
- `LAYOUT_REWORK_NOTES.md`
- `COMMERCIAL_HARDENING_SPRINT_10A.md`

## B. UI Sobriety Audit

The audit found too much simultaneous color and badge treatment across Home, Strategy, Pipeline, Create, and Calendar. The biggest product issue was Strategy: strategic editing still felt like Settings work.

See `UI_SOBRIETY_AUDIT.md`.

## C. Global Color/Badge Reduction

- Softened `Panel` borders.
- Neutralized normal success pills.
- Made `StatCard` treatment quieter.
- Removed programme color dots/rails from Home, Pipeline, and Create defaults.
- Neutralized Calendar format/programme chips.
- Kept warning/error colors for real state.

## D. Home Layout Changes

- Home now centers on one dominant Next Action block.
- Readiness is shown with quiet icon rows instead of colored pills.
- Operational counts remain neutral.
- Programme and recent-work sections use calmer metadata.
- No WorkTrace or progress bars were added.

## E. Strategy Extraction/Editing Changes

- Strategy now includes inline editors for Brand Profile, Content Strategy, Programmes, and Risk/Claims Guidance.
- Edits save to `brand_profiles.settings`.
- Parent app state and tenant localStorage update after save.
- Strategy no longer sends users to Settings for primary edits.

## F. Settings Repositioning

- Settings now defaults to Workspace.
- Brand/Profile/Programmes sections are labeled as mirrors.
- Settings copy frames these as compatibility/admin fallback.
- Settings remains available for Workspace, Privacy, Providers, Billing, Rules, Appearance, and technical/admin configuration.

## G. Create Layout/Readiness Changes

- Create keeps real readiness bars for production completeness.
- Queue rows use neutral rails instead of programme colors.
- Metadata is quieter and uses generic Angle language.

## H. Calendar Layout Changes

- Planner audit detail is collapsed by default.
- Large colored audit numbers were softened.
- Format chips and programme labels are neutral.
- No progress bars were added.
- Calendar remains planning/readiness, not publishing automation.

## I. Analyze Simplification

Analyze already used the Sprint 9D Workspace signals framing. Sprint 10A preserved that direction and did not add analytics complexity.

## J. Pipeline/DetailModal Follow-Up Changes

- Pipeline programme/angle coloring was neutralized by default.
- Real quality/compliance warning color remains available.
- DetailModal was not deeply redesigned in this sprint.

## K. Source/Work Review Consistency

Source/work review remains on demand. No source traces are displayed automatically and no fake source detail was added.

## L. Privacy/Compliance Consistency

- No privacy or compliance guarantees were changed.
- No raw sensitive logging was added.
- Compliance, acknowledgement, approval, and export routes/components were left intact.
- No mandatory Peek Media human review was introduced.

## M. What Was Intentionally Not Implemented

- Studio V1.
- Publishing automation.
- Advanced analytics.
- New providers.
- Billing features.
- CRM.
- Data model rewrite.
- Full DetailModal redesign.
- Full Settings consolidation/removal.
- New assistant panel or scattered AI buttons.

## N. Recommended Next Sprint Plan

- Sprint 10B: DetailModal hierarchy and compliance/approval/export visibility polish.
- Sprint 10C: Settings consolidation, removing duplicated strategy editing once Strategy is proven.
- Sprint 10D: Calendar readiness gating around approval/export state.
- Sprint 10E: Create stage hierarchy with compliance/approval/export as first-class production steps.

## O. Build/Lint Results

- `npm run lint --if-present`: passed/no-op because no lint script is configured.
- `npm run build`: passed on Next.js 14.2.35.

## P. Manual Test Checklist

- App builds clean.
- Home loads and is calmer.
- Strategy loads and supports inline editing.
- Strategy saves Brand Profile / Content Strategy / Programmes / Risk Guidance.
- Strategy no longer frames Settings as the main edit surface.
- Settings opens and defaults toward admin/technical configuration.
- Onboarding, Ideas, Pipeline, Create, Calendar, Analyze, Billing, Privacy settings, AgentPanel, and Campaigns remain available.
- Create readiness bars represent actual production completeness.
- Calendar has reduced audit-board feeling.
- No database migration is required.

## Q. Remaining Risks

- Strategy and Settings still duplicate some editing paths.
- Strategy editor is broad but not yet a complete replacement for every advanced Settings field.
- DetailModal still needs a dedicated sobriety and hierarchy pass.
- Legacy `stories`, `script`, and `archetype` data names remain internally for compatibility.

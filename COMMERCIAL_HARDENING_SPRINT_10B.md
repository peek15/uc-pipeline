# Commercial Hardening Sprint 10B

Version: v3.35.0

## A. Files Changed

- `CLAUDE.md`
- `package.json`
- `package-lock.json`
- `src/app/page.js`
- `src/components/SettingsModal.jsx`
- `src/components/PipelineView.jsx`
- `PIPELINE_DISPLAY_PREFERENCES_NOTES.md`
- `COMMERCIAL_HARDENING_SPRINT_10B.md`

## B. Current Appearance / Settings Audit

Settings already had an Appearance section for theme, density, and default tab. Those values are currently part of brand profile settings, so they are not ideal for user-only interface preferences.

No clean user preference table exists in the current product surface. LocalStorage is the lowest-risk Sprint 10B path.

## C. Storage Decision

Pipeline display is persisted with localStorage:

- Key: `ce_pipeline_display_mode`
- Values: `essential`, `detailed`
- Default: `essential`

The preference is also held in app state so Pipeline updates immediately when the user changes it.

It is not stored in `brand_profiles`, Brand Strategy, or workspace settings.

## D. Pipeline Display Behavior

`PipelineView` now receives:

- `displayMode`
- `onDisplayModeChange`

The same preference is exposed in:

- Settings → Appearance
- a subtle Pipeline header display shortcut

Both write to the same app state and localStorage key.

## E. Essential Mode Definition

Essential is the default calmer client-facing display.

It shows:

- title
- neutral angle/content metadata
- next action
- readiness count
- meaningful quality/compliance state
- workflow controls

It hides:

- AI/community score
- reach score
- metrics views
- subject tags
- campaign metadata
- hook text
- scoring breakdown
- score/reach filters
- score/ranking sort controls
- re-audit visible action

## F. Detailed Mode Definition

Detailed restores operational metadata for power users.

It shows:

- AI/community score
- reach score
- metrics views
- subject tags
- campaign metadata
- hook text
- scoring breakdown
- score/reach filters
- score/ranking sort controls
- re-audit visible action

Detailed mode remains visually sober and does not restore heavy color treatment.

## G. What Was Intentionally Not Changed

- Scoring logic.
- Ranking logic.
- AI generation.
- Backend routes.
- Database fields.
- Saved story/content data.
- Brand Profile / Strategy settings.
- Create/Analyze display modes.
- Global compact mode.

## H. Build/Lint Results

- `npm run lint --if-present`: passed/no-op because no lint script is configured.
- `npm run build`: passed on Next.js 14.2.35.

## I. Manual Test Checklist

- App builds clean.
- Settings opens.
- Appearance section includes Pipeline display.
- Default mode is Essential when no localStorage preference exists.
- Switching to Detailed updates Pipeline immediately.
- Switching back to Essential hides scores and detailed metadata.
- Preference persists via `ce_pipeline_display_mode`.
- Pipeline still loads.
- Home, Strategy, Onboarding, Ideas, Create, Calendar, Analyze, DetailModal, Compliance/Approval/Export, Billing, Privacy settings, AgentPanel, and Campaigns remain available.
- No database migration is required.

## J. Remaining Risks

- Existing saved filters can still affect results even if the filter controls are hidden in Essential.
- LocalStorage means the preference is per browser/device until a user preference table exists.
- Power users may want more granular controls later, but Sprint 10B intentionally keeps only Essential/Detailed.

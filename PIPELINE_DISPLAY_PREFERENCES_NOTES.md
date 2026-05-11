# Pipeline Display Preferences Notes

Sprint 10B adds a user-facing Pipeline display preference without changing scoring, ranking, generation, or saved content data.

## Current Appearance / Settings Audit

- Settings already has an Appearance section for theme, density, and default tab.
- Existing Appearance values are stored inside `brand_profiles.settings`, which makes them brand/workspace settings.
- Pipeline display density is a user/interface preference, not a brand strategy or workspace configuration.
- There is no clean user preference table in the current app structure.
- The safest first implementation is localStorage with app-level state so the Pipeline can update immediately without a page reload.

## Storage Decision

- Key: `ce_pipeline_display_mode`
- Values: `essential`, `detailed`
- Default: `essential`
- Storage: localStorage

The preference is intentionally not stored in:

- `brand_profiles`
- `settings.strategy`
- workspace settings
- any database migration

## Pipeline Behavior

Essential mode shows the calmer client-facing row:

- title
- angle / content type / channel
- next action
- readiness count
- compliance/quality gate state when meaningful
- row expansion and normal workflow controls

Essential mode hides by default:

- AI/community score
- reach score
- metrics views
- subject tags
- campaign metadata
- hook text
- scoring breakdown
- re-audit/sort scoring controls
- detailed score filters

Detailed mode shows operational metadata:

- AI/community score
- reach score
- metrics views
- subject tags
- campaign metadata
- hook text
- scoring breakdown
- scoring/reach filters
- re-audit and score/ranking sort controls

Detailed mode still follows Sprint 10A sobriety rules: neutral treatment by default, color only for real warning/error/state.

## Non-Goals

- No scoring logic changes.
- No ranking logic changes.
- No AI generation changes.
- No backend route changes.
- No database migration.
- No global compact mode.
- No Create/Analyze display settings.

## Remaining Risk

- Existing saved hidden filters can still affect Pipeline results after switching to Essential, because filtering logic remains unchanged. This is intentional for now to avoid changing ranking/filter behavior.

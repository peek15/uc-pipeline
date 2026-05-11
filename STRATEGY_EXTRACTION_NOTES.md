# Strategy Extraction Notes

Sprint 10A moved Strategy from a read-only summary into the primary editable strategy surface.

## What Changed

- `StrategyView.jsx` now owns inline editable panels for:
  - Brand Profile
  - Content Strategy
  - Programmes
  - Risk / Claims Guidance
- Strategy saves back to `brand_profiles.settings` using the same Supabase table and JSON settings shape as Settings.
- Strategy calls the parent `onSettingsChange` callback after saving so the app shell and active brand profile state update immediately.
- Strategy persists the updated settings to tenant-scoped localStorage as a fallback.
- Strategy no longer says editing lives in Settings.
- Assistant entry remains routed through the existing assistant panel with structured strategy context.

## Settings Repositioning

- Settings now defaults to Workspace instead of Brand Profile.
- Settings left nav labels now call brand/strategy/programmes sections mirrors.
- Brand, Strategy, and Programmes sections in Settings include copy that frames them as compatibility/admin fallback.
- Settings remains available for deeper technical/admin configuration and legacy paths.

## Why This Is Low-Risk

- No schema change was introduced.
- Existing Settings save behavior was not removed.
- Existing settings JSON paths are preserved.
- Programmes still use `settings.strategy.programmes`.
- Brand Profile fields still use `settings.brand`.
- Content Strategy and Risk/Claims fields still use `settings.strategy`.

## Remaining Risks

- Strategy does not yet expose every advanced Settings field.
- Strategy does not yet have per-field validation beyond preserving the existing JSON shape.
- Settings and Strategy can both edit the same settings until a future consolidation removes duplicate admin mirrors.

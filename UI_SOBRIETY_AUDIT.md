# UI Sobriety Audit

Sprint 10A focused on making Creative Engine calmer, more premium, and less visually noisy before a client-facing pilot.

## Findings

- Home had too many dashboard-like metric cards, readiness pills, colored programme dots, and visible actions competing for attention.
- Strategy was mostly read-only and explicitly sent users back to Settings, making strategic setup feel like admin configuration.
- Settings still treated Brand Profile, Content Strategy, and Programmes as primary sections.
- Create was improved in Sprint 9D but still used colored programme rails and multiple visible readiness marks.
- Calendar still felt like an audit board: large audit numbers, colored programme chips, colored format labels, and visible audit rows dominated the weekly view.
- Pipeline still used colored programme/angle rails by default.
- Global `Pill` and `StatCard` styling made normal metadata feel like stateful information.
- Analyze was already sober after Sprint 9D; the main risk was retaining heavy dashboard treatment.

## Applied Reduction Rules

- Neutralized success pills by default; green should not mean every completed setup fact is a dramatic state.
- Softened default panels and stat cards with lower-contrast borders.
- Removed or neutralized programme color treatment on Home, Pipeline, Create, and Calendar where it was decorative metadata.
- Preserved warning/error colors for real attention, compliance, or blocked states.
- Preserved Create readiness bars because they reflect actual production completeness.
- Avoided progress bars outside Create readiness.

## Remaining Color Sources

- Active navigation and primary actions.
- Real warning/error states.
- Compliance/approval/export components from Sprint 8.
- Some legacy campaign colors when campaign data is explicitly shown.
- Some format/programme color constants remain in the data model and deeper legacy surfaces.

## Remaining Risks

- A complete visual-density pass on DetailModal and all Settings subsections is still needed.
- Legacy constants and data fields still include color-rich programme and format defaults.
- Calendar still has auto-fill controls; they are useful but should become more conservative in a future planning sprint.

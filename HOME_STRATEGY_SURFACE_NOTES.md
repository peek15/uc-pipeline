# Home / Strategy Surface Notes

## Home V1
Home is a cockpit, not an analytics dashboard.

It answers:
- Is my workspace ready?
- What should I do next?
- What content is in progress?
- What needs approval?
- What is ready to export?
- What has Creative Engine recently produced or learned?

Current data sources:
- `stories`
- `brand_profiles.settings`
- programme helpers in `brandConfig.js`

Current sections:
- Next action
- Workspace readiness
- In progress / needs approval / ready to export / published counts
- Programmes
- Workspace signals
- Recent outputs
- Quick links

No WorkTrace appears on Home by default. No progress bars, boot copy, or engine metaphors are used.

## Strategy V1
Strategy is now a product surface, but editing still happens through Settings.

It shows:
- Brand Profile summary
- Content Strategy summary
- active Programmes
- risk/claims guidance
- setup status
- onboarding refresh CTA
- assistant CTA
- source/work review affordance

Why read-oriented:
- Settings already owns save/load logic.
- Duplicating save logic would increase risk.
- Sprint 9B is app-shell coherence, not full Strategy editor extraction.

## Settings Repositioning
Settings still contains Brand Profile / Content Strategy / Programmes for editing.

Product direction:
- Strategy becomes the primary review surface.
- Settings remains admin/technical configuration and advanced editing until Strategy editor components are extracted.

## Empty States
Home:
- no strategy -> open Strategy
- no programmes -> review Strategy
- no pipeline content -> open Ideas

Strategy:
- no Brand Profile -> run onboarding
- no Content Strategy -> edit Settings / refresh onboarding
- no Programmes -> draft programmes
- no risk guidance -> edit guidance


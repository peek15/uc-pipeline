# Content-Agnostic Audit

Last updated: v3.18.1

## Current Assessment

The product is now partly content-agnostic at the brand, provider, language, and production-workflow layers, but the core domain model is still story-shaped. It can support other narrative brands today, and it can begin supporting publicity or campaign content if those formats fit the existing fields. It is not yet fully content-type agnostic.

## Already Generalized

- Brand profiles can switch per workspace and keep separate settings.
- Research, scoring, script generation, translation, reach scoring, and agent context receive brand configuration.
- Programmes are configurable and now drive operational lane colors in Stories, Create, Produce, and Calendar.
- Language readiness uses configured brand languages and the `stories.scripts` JSONB map.
- Provider settings, provider health, AI usage, cost alerts, and secure provider secrets are brand-scoped.
- Quality Gate can use brand-specific factual-anchor terms.
- App chrome, CSV export/import, Airtable sync, Detail, and main queues use generic subject/language helpers.

## v3.17.7 Progress

- Added row-level content metadata: `content_type`, `objective`, `audience`, `channel`, `campaign_id`, `campaign_name`, and `deliverable_type`.
- Added shared content type/channel constants and helpers so UI can reason about narrative, ad, publicity, product, educational, and community content.
- Pipeline is now labeled Content and can filter/search by content type, channel, objective, audience, campaign, and deliverable.
- Detail modal can edit the new content metadata without changing the existing story table name.
- CSV import/export now preserves content type, programme, objective, audience, channel, campaign, and deliverable fields.

## v3.17.8 Progress

- Onboarding can now propose `settings.strategy.content_templates` from the conversation plus uploaded brand-memory summaries.
- The onboarding prompt audits existing templates and only proposes a new template when it differs enough in content type, objective, audience, channel, deliverable type, required fields, or workflow.
- Settings now exposes a manual content template editor for name, type, objective, audience, channels, deliverable, required fields, and workflow steps.
- Applying onboarding output normalizes template IDs and dedupes against existing templates before saving.

## v3.17.9 Progress

- Research can now target a specific content template and passes it into the ideation prompt.
- New researched items save `content_template_id` plus template-derived `content_type`, `objective`, `audience`, `channel`, and `deliverable_type`.
- Detail can edit the assigned template.
- Create shows the assigned template, required fields, and workflow steps for the selected item.
- Brief and assembly production agents receive the assigned template context before generating handoff output.

## v3.18.0 Progress

- Create workflow steps are now driven by the assigned content template's `workflow_steps`.
- Non-video templates can skip voice, visuals, and assembly by omitting those steps.
- Copy/ad/press/outline workflow tokens map to the primary writing workspace.
- Unknown workflow tokens render as template-specific notes/checkoff steps stored in `story.metadata.template_progress`.
- Review/progress now reflects only the steps required by the selected template.
- Script/copy generation now adapts output to the selected template's content type, objective, audience, channel, deliverable type, and required fields.

## v3.18.1 Progress

- Quality Gate now selects a profile from the assigned content template/content type.
- Narrative content still checks story fit: subject, archetype, era, human tension, hook, and factual anchor.
- Ads check objective, audience, channel, deliverable, CTA, and proof.
- Publicity checks news value and factual/news anchors.
- Product posts check audience, deliverable, and benefit/use-case clarity.
- Educational content checks lesson/takeaway clarity.
- Community content checks participation prompts.
- Gate output now records `profile`, `template_id`, and `content_type`.

## Remaining Story Bias

- Main table and UI still call items `stories` throughout navigation, schema, API sync, and agents.
- Core fields are narrative-first: `title`, `players`, `era`, `archetype`, `angle`, `hook`, `script`.
- Status pipeline assumes editorial story flow: `accepted`, `approved`, `scripted`, `produced`, `published`.
- Production agents are optimized for short-form narrative videos, not ads, product pages, launch assets, or multi-asset campaigns.
- Calendar plans publishing cadence, but not campaign flights, ad sets, channels, placements, or deliverable bundles.
- Metrics are social-video oriented: views, completion, watch time, likes, comments, saves, shares, follows.
- Airtable defaults to a `Stories` table unless configured by environment.

## Gap To Publicity / Diverse Content

To produce publicity and broader content types well, the app needs a content-object layer above stories:

- `content_items`: generic item name, content type, objective, audience, offer, subject, campaign, channel, deliverable format.
- `campaigns`: launch windows, budgets, target audiences, channels, offers, creative angles.
- `deliverables`: ad script, landing page copy, email, short video, carousel, press release, product post, UGC brief.
- `workflow_templates`: pipeline stages per content type instead of one universal story status ladder.
- `quality_gate_profiles`: different checks for narrative, ad, educational, product, and publicity content.
- `metric_profiles`: social-video metrics, ad metrics, email metrics, web metrics, campaign metrics.

## Recommended Next Phases

1. Add campaign calendar mode for flights and deliverable bundles.
2. Introduce true `campaigns` / `deliverables` tables once UI semantics are stable.
3. Add Settings controls for custom gate rules per template.

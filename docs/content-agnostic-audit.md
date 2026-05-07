# Content-Agnostic Audit

Last updated: v3.17.6

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

1. Rename user-facing `Stories` language to `Content` where safe, while keeping database compatibility.
2. Add `content_type`, `objective`, `audience`, `channel`, and `campaign_id` fields to the schema.
3. Add content templates in Settings: Narrative story, Ad concept, Product post, Educational explainer, Press/publicity asset.
4. Make Research become Ideation, with prompts selected by content template.
5. Make Create steps template-driven so publicity/ad flows do not require narrative-only assets.
6. Add campaign calendar mode for flights and deliverable bundles.


# Pipeline / Create / Calendar / Analyze Audit

Commercial Hardening Sprint 9D audited the four main operational surfaces after the app shell, Strategy, Home, and onboarding work from Sprints 9A-9C.

## Current Operational Flow

- Ideas/Research creates content records in the existing `stories` model.
- Pipeline moves content through accepted, approved, scripted, produced, and published states.
- Create works from approved/scripted/produced items and uses template workflow steps to generate drafts, translations, briefs, assets, voice, visuals, assembly, and review.
- Calendar schedules approved/scripted/produced content and checks weekly cadence/readiness.
- Analyze reads published/logged content metrics and shows workspace signals.
- DetailModal remains the shared review surface for one content item, including Sprint 8 compliance, approval, and export controls.

## Language Classification

Safe to make generic globally:

- Story as a visible product label where it means a multi-tenant content item.
- Script as a visible product label where it means the first content draft.
- Produced when it means ready/exportable output.
- Archetype where it functions as a content angle in generic UI.

Should remain profile/data scoped:

- Uncle Carter defaults and seed data.
- NBA/team/player concepts if the active brand data explicitly contains them.
- Legacy database fields such as `stories`, `script`, and `archetype`.

Postponed:

- Deep rename of the `stories` table/model.
- Reworking keyboard shortcut docs that still reference legacy story/script concepts.
- Full campaign model decision.
- Deeper status model migration from `scripted`/`produced` to generic workflow states.

## Surface Findings

Pipeline was functional but too dense by default. It exposed scores, readiness, quality gate state, campaign metadata, subject tags, and legacy angle/archetype cues in a single row. Sprint 9D keeps the existing model but adds an operational summary, clearer next actions, and more generic labels.

Create already had a strong template workflow, but the visible copy still made it feel like a Script tab. Sprint 9D reframes it as the production surface for drafting, editing, checking, and preparing content.

Calendar was useful but over-weighted cadence and auto-production language. Sprint 9D reframes it as planning/readiness, removes the coverage progress bar, and avoids publishing-automation promises.

Analyze had the right direction from Sprint 9B but still carried “Insights” and “intelligence layer” language. Sprint 9D frames it as deterministic workspace signals and adds an honest learning card.

## Remaining Risks

- The underlying status names are still legacy and can leak through some lower-level surfaces.
- The current Calendar auto-fill and draft preparation actions are useful but still need more explicit approval/export awareness.
- Create does not yet show a unified compliance/approval/export stage in the main workspace; those controls still primarily live in DetailModal/Sprint 8 flows.
- Analyze remains dependent on manually logged/imported metrics.

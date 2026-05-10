# Commercial Hardening Sprint 5B — Brand Strategy Control Center

**Version:** 3.26.0
**Date:** 2026-05-10
**Builds on:** Sprint 5A (agent orchestration foundation)

---

## A. Files Changed

| File | Change type |
|------|-------------|
| `src/components/SettingsModal.jsx` | DEFAULT_SETTINGS + Brand Profile UI + Content Strategy UI + Programmes UI |
| `src/lib/brandConfig.js` | New helper functions + extended brandConfigForPrompt + language fallback fix |
| `src/lib/agent/taskTypes.js` | cost_center updated to "strategy_advisor" for strategy task types |
| `src/lib/ai/prompts/research-stories.js` | Brand context: target_audience, content_pillars, preferred_angles, goals |
| `src/lib/ai/prompts/score-story.js` | Brand context: target_audience, content_pillars |
| `src/lib/ai/prompts/generate-script.js` | Brand context: target_audience, content_pillars, key_messages, CTAs, compliance |
| `src/app/page.js` | Version bump to 3.26.0 |
| `package.json` + `package-lock.json` | Version bump to 3.26.0 |
| `CLAUDE.md` | Brand Strategy + Agent Architecture sections added |

New files:
- `supabase-sprint5b-brand-strategy.sql`
- `COMMERCIAL_HARDENING_SPRINT_5B.md` (this file)

---

## B. Existing Brand/Settings Audit Summary

- All brand strategy lives in `brand_profiles.settings` JSONB — no separate columns needed.
- `mergeSettings()` does a shallow merge per top-level key, so UC's saved values always override generic defaults.
- `brandConfigForPrompt(settings)` was the only path into AI prompts — now extended with new fields.
- `getBrandLanguages()` had a fallback to `["fr","es","pt"]` for UC — changed to `[]` for generic clients.
- Programmes section had "AI audit & suggest" buttons that violated the one-assistant rule — replaced with "Ask assistant" entry points.
- DEFAULT_SETTINGS used 4 UC-specific programme presets (standard/classics/performance_special/special_edition) — changed to `[]`.
- `languages_secondary` default changed from `["FR","ES","PT"]` to `[]`.

---

## C. Schema Changes / SQL Migration

**File:** `supabase-sprint5b-brand-strategy.sql`

No new table columns. All strategy fields are stored in the existing `brand_profiles.settings` JSONB column. The migration adds:
- `CREATE INDEX IF NOT EXISTS idx_brand_profiles_settings_gin ON brand_profiles USING GIN (settings)` — for efficient JSONB queries
- Comments documenting the expected JSONB shape

---

## D. Brand Profile Model (settings.brand)

New fields added to DEFAULT_SETTINGS.brand:
- `tagline` — one-line positioning
- `short_description` — 2-3 sentence description
- `industry` — e.g. "Professional services"
- `products_services` — what the brand sells/offers
- `target_audience` — primary audience description (used in prompts)
- `markets` — geographic scope
- `visual_style` — visual direction descriptor
- `brand_values` — core values text
- `differentiators` — competitive differentiators
- `competitors_or_references` — reference/competitor brands

Changed:
- `languages_secondary`: `["FR","ES","PT"]` → `[]` (generic default)

---

## E. Content Strategy Model (settings.strategy)

New fields added to DEFAULT_SETTINGS.strategy:
- `content_goals` — what content should achieve
- `target_platforms` — array of platforms
- `content_pillars` — array of pillar names
- `key_messages` — recurring messages to reinforce
- `preferred_angles` — angles that work well
- `avoid_angles` — angles to avoid
- `calls_to_action` — preferred CTAs
- `claims_to_use_carefully` — ROI claims, guarantees, etc.
- `compliance_sensitivities` — regulatory/platform restrictions

Changed:
- `programmes` default: 4 UC presets → `[]` (generic clients start empty)
- `content_templates` default: UC narrative template → `[]`

---

## F. Programmes Model

Extended programme shape:
```json
{
  "id": "uuid",
  "name": "Product spotlight",
  "description": "Weekly showcase of one product with customer proof",
  "color": "#5B8FB9",
  "role": "reach",
  "weight": 30,
  "active": true,
  "cadence": "Weekly",
  "platforms": ["Instagram", "LinkedIn"],
  "tone": "",
  "example_topics": "",
  "avoid_topics": "",
  "target_audience_desc": "",
  "primary_goal": "",
  "angle_suggestions": ["before/after", "customer story"],
  "custom_fields": []
}
```

New fields: `description`, `active`, `cadence`, `platforms`, `tone`, `example_topics`, `avoid_topics`, `target_audience_desc`, `primary_goal`

UI: added `active` on/off toggle in programme card header; `description`, `cadence`, `platforms` inputs in card body.

---

## G. Strategy Recommendations Model (settings.strategy_recommendations)

New top-level JSONB key — array of:
```json
{
  "id": "uuid",
  "type": "programme|content_pillar|campaign|content_idea|platform_strategy|risk_warning",
  "title": "...",
  "rationale": "...",
  "target_audience": "...",
  "platforms": [],
  "formats": [],
  "priority": "low|medium|high",
  "status": "suggested|accepted|dismissed|converted_to_programme|converted_to_campaign|converted_to_content",
  "created_by": "agent|user|system",
  "created_at": "2026-05-10T..."
}
```

No UI implemented yet — data model ready for future Strategy Advisor UI.

---

## H. Settings UI Changes

### Brand Profile section
- Added "Brand identity" subsection below existing voice/goals fields
- Fields: Industry, Tagline, Short description, Target audience, Products & services, Markets, Visual style, Brand values, Differentiators, Competitors or references
- "Ask assistant about this brand profile" button → `task_type: improve_brand_profile`
- Suggested actions: Review and improve, Suggest content pillars, Find missing brand information

### Content Strategy section
- Added "Content strategy" subsection at top of section
- Fields: Content goals, Target platforms, Content pillars, Key messages, Preferred angles, Avoid angles, Calls to action, Claims to handle carefully, Compliance sensitivities
- "Ask assistant about this strategy" button → `task_type: suggest_content_pillars`
- Suggested actions: Suggest content pillars, Suggest campaign ideas, Suggest content ideas, Identify risky claims
- Existing "Publishing rhythm" block moved below new strategy fields

### Programmes section
- Removed: "AI audit & suggest" button from header (replaced with "Ask assistant")
- Removed: "AI audit & suggest" button from body
- Removed: AI suggested programmes display panel
- Removed: Strategy audit result display panel
- Added: Generic empty state with example programme types (Product spotlight, Founder insights, Case studies, etc.)
- Added: `active` on/off toggle per programme card
- Added: `description` textarea per programme card
- Added: `cadence` and `platforms` inputs per programme card
- Changed: "Content angle suggestions" placeholder from NBA-specific to generic

---

## I. Assistant Integration Changes

### New entry points wired

| Component | Section | Task type | Suggested actions |
|-----------|---------|-----------|-------------------|
| SettingsModal | Brand Profile | `improve_brand_profile` | Review/improve, suggest pillars, find missing info |
| SettingsModal | Content Strategy | `suggest_content_pillars` | Suggest pillars, campaign ideas, content ideas, identify risky claims |
| SettingsModal | Programmes (header) | `suggest_programmes` | Suggest programmes, campaign ideas, identify gaps |

All entry points call `openAssistant(buildAgentContext({...}))` — no secondary panels created.

### taskTypes.js cost_center updates

| Task type | Old cost_center | New cost_center |
|-----------|----------------|----------------|
| improve_brand_profile | strategy | strategy_advisor |
| suggest_content_pillars | strategy | strategy_advisor |
| suggest_programmes | strategy | strategy_advisor |
| suggest_campaign_ideas | research | strategy_advisor |
| suggest_content_ideas | research | strategy_advisor |

---

## J. Strategy Advisor Skeleton

All relevant `task_type` keys exist in `taskTypes.js` with:
- `capability: "strategy"`
- `cost_center: "strategy_advisor"`
- `cost_category: "advisory_agent"`

When a user opens the assistant from Brand Profile, Content Strategy, or Programmes sections, the panel receives:
- structured `agent_context` with source_view, source_component, task_type
- `brand_snapshot` with current brand name, content_type, and relevant fields
- `suggested_actions` that appear as quick-start options in the assistant empty state

The assistant can answer strategy questions using the context injected into the system prompt via `buildContextBlock()`.

**Not implemented in this sprint:**
- Saved recommendations UI
- Automatic recommendation generation
- Performance history integration
- External market data
- Intelligence layer integration

---

## K. Prompt Integration Changes

### `research-stories.js`
Added to prompt context when available:
- `target_audience` → "Target audience: ..."
- `content_pillars` → "Content pillars: ..."
- `preferred_angles` → "Preferred angles: ..."
- `avoid_angles` → "Avoid these angles: ..."
- `content_goals` → "Content goals: ..."

### `score-story.js`
Added to prompt context when available:
- `target_audience` → audience context line
- `content_pillars` → pillars context line

### `generate-script.js`
Added to system prompt when available:
- `target_audience` → audience context
- `content_pillars` → pillars context
- `key_messages` → messages to reinforce
- `calls_to_action` → preferred CTAs
- `compliance_sensitivities` → compliance guidance

All additions are conditional — empty fields produce no prompt noise.

---

## L. Uncle Carter Compatibility Notes

- UC workspace has all brand settings saved in Supabase `brand_profiles.settings`
- `mergeSettings()` applies saved DB values over DEFAULT_SETTINGS → UC's `voice`, `avoid`, `programmes`, `name`, etc. are preserved
- UC's `languages_secondary: ["fr","es","pt"]` in DB overrides the new generic default `[]`
- UC's 4 programme presets (standard/classics/performance_special/special_edition) in DB override the new `[]` default
- `UC_TEAMS`, `UC_RESEARCH_ANGLES`, `UC_SCRIPT_SYSTEM` named exports remain in `constants.js`
- No re-onboarding required

---

## M. What Is Intentionally Not Implemented

- Full AI onboarding (brand brief → auto-fill)
- Studio
- Full Strategy Advisor automation (no auto-create campaigns)
- Market intelligence / external trend APIs
- Google Trends / YouTube / TikTok integration
- Publishing automation
- New providers
- Strategy recommendations UI (data model exists, no read/write UI yet)
- Compliance checker workflow
- CRM or lead tracking

---

## N. Build/Lint Results

```
✓ Compiled successfully
✓ Generating static pages (13/13)
Route / — 206 kB first load JS
```

No errors. No type warnings.

---

## O. Manual Test Checklist

- [ ] Settings opens, Brand Profile section loads existing UC data
- [ ] New brand identity fields (industry, target_audience, etc.) appear and save
- [ ] Content Strategy section shows new strategy fields above publishing rhythm
- [ ] Content strategy fields save/load correctly
- [ ] Programmes: empty state shows for new workspace (no NBA presets)
- [ ] Uncle Carter workspace: existing programmes still appear (DB values override)
- [ ] Add programme → new card has generic defaults, not NBA values
- [ ] Programme `active` toggle works
- [ ] Programme `description`, `cadence`, `platforms` fields save
- [ ] "Ask assistant about this brand profile" opens assistant with `improve_brand_profile` context
- [ ] "Ask assistant about this strategy" opens assistant with `suggest_content_pillars` context
- [ ] "Ask assistant" in Programmes header opens with `suggest_programmes` context
- [ ] Assistant suggested actions appear inside the right-side panel
- [ ] No second assistant panel created
- [ ] Billing section still works
- [ ] Providers section still works (Ask assistant button present)
- [ ] Research with generic brand (no NBA defaults in prompt)
- [ ] Script generation uses new brand context fields when populated
- [ ] Pipeline, Create, Calendar, Analyze still load
- [ ] No React hook order errors in console

---

## P. Remaining Risks

1. **mergeSettings shallow merge**: New nested fields inside `strategy` (e.g. `content_goals`) are not merged deeply — if UC's saved `strategy` object is read, it won't contain new fields until the user saves. They'll silently default to empty until first save. Acceptable for this sprint.
2. **Programmes empty state for UC**: UC workspace has programmes saved in DB, so the empty state won't show. But a brand-new workspace or a workspace that somehow has `strategy.programmes = []` in DB will see the empty state. Correct behavior.
3. **Language secondary `[]` default**: Existing UC workspace has `["fr","es","pt"]` saved in DB. New workspaces default to English-only. Users must add secondary languages manually. Consider adding a language picker in the Brand Profile section in a future sprint.
4. **Strategy recommendations data model**: No read/write UI yet. Recommendations from the assistant (via chat) are not auto-saved to the recommendations array. Future sprint work.
5. **Content templates default `[]`**: Changed from having 1 UC narrative template. New workspaces have no templates. This is correct behavior but users will need to add templates if they use the Create workflow heavily.

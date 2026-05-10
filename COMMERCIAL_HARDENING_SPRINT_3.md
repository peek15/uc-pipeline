# Commercial Hardening Sprint 3
**Date:** 2026-05-10  
**Version:** 3.22.0 → 3.23.0  
**Build result:** ✅ Clean — 0 errors, 0 warnings

---

## A. Files Changed

| File | Change |
|---|---|
| `src/lib/constants.js` | FORMATS descriptions de-NBAed; added `UC_TEAMS`, `UC_RESEARCH_ANGLES`, `UC_SCRIPT_SYSTEM` named exports |
| `src/lib/brandConfig.js` | All UC fallbacks removed: `getBrandName` → `""`, `getAppName` → "Creative Engine", `getBrandVoice/Avoid` → `""`, taxonomy `subjects/research_angles` → `[]`, `script_system` → `null`, `closing_line` → `""`; removed `RESEARCH_ANGLES`/`SCRIPT_SYSTEM`/`TEAMS` imports |
| `src/lib/ai/prompts/score-story.js` | `|| "Uncle Carter"` → `|| "your brand"` |
| `src/lib/ai/prompts/research-stories.js` | `|| "Uncle Carter"` → `|| "your brand"`; removed `RESEARCH_ANGLES` import; `angles` fallback is now `[]` (no UC default) |
| `src/lib/ai/prompts/generate-script.js` | `|| "Uncle Carter"` → `|| "your brand"` |
| `src/components/SettingsModal.jsx` | `DEFAULT_SETTINGS` brand-neutralized: `name ""`, `voice ""`, `avoid ""`, `locked_elements []`, `taxonomy.subjects []`, `taxonomy.research_angles []`, `prompts.script_system ""`; removed `RESEARCH_ANGLES`/`SCRIPT_SYSTEM`/`TEAMS` imports |
| `src/components/ProvidersSection.jsx` | `save()` now returns early with error when selected provider has `not_implemented` flag |
| `src/app/layout.js` | `title` → "Creative Engine", `description` → "AI content studio — research, script, schedule, analyze.", `appleWebApp.title` → "Creative Engine" |
| `src/components/LoginScreen.jsx` | `appName` fallback → "Creative Engine"; `orgName` fallback → `""` (hidden when empty); description → "AI content studio"; added AI compliance notice |
| `src/lib/ai/audit.js` | `logAiCall`, `logAiCallError`, `logProviderCost` all accept `cost_center` and `cost_category` params; values written to `ai_calls` table |
| `supabase-sprint3-cost-logging.sql` | **New** — ADD COLUMN `cost_center`/`cost_category` on `ai_calls`; new `cost_events` table with RLS; indexes |
| `src/app/page.js` | Version 3.23.0 |
| `package.json` | Version 3.23.0 |
| `package-lock.json` | Version 3.23.0 |

---

## B. SQL / Migrations to Run

**File:** `supabase-sprint3-cost-logging.sql`  
Run in Supabase → SQL Editor. Safe to rerun.

### What the migration does

1. **`ai_calls` — ADD COLUMN `cost_center` TEXT** — which product area drove the spend (research, script, translation, voice, visual, onboarding, compliance, support, reporting, studio_future, internal_admin, workspace_ops)
2. **`ai_calls` — ADD COLUMN `cost_category` TEXT** — type of spend (generation, compliance, internal_admin)
3. **Indexes** on both new columns (sparse, `WHERE NOT NULL`)
4. **`cost_events` table** — track non-token costs (per-seat, storage, manual entries) scoped to a workspace
5. **RLS on `cost_events`** — workspace members can read; inserts via service role only

### No destructive changes

All changes are additive. Existing rows get NULL for the new columns. Old callers that don't pass `cost_center`/`cost_category` continue to work unchanged.

---

## C. What Was Fixed / Changed

| Item | Change |
|---|---|
| App name "Content Pipeline" / "Uncle Carter Pipeline" | Replaced with "Creative Engine" in layout metadata and LoginScreen fallback |
| FORMATS descriptions contained "NBA" references | Changed to "Modern era" / "Classic era" |
| `getBrandName` fell back to "Uncle Carter" | Now falls back to `""` (no brand) |
| `DEFAULT_SETTINGS` seeded UC subjects/angles/script | Cleared to `[]` / `""` — UC workspace's saved DB values take precedence |
| `SCRIPT_SYSTEM` leaked into new workspaces as script prompt default | `prompts.script_system` default is now `""` |
| `not_implemented` providers could be saved via UI | `save()` in `ProvidersSection` now blocks with error message |
| Compliance notice absent from login | Added 10px footer note about AI-assisted output review |
| `ai_calls` had no cost attribution fields | Added `cost_center` + `cost_category` to all three logging functions |
| No non-token cost tracking | New `cost_events` table for per-workspace manual or non-LLM cost entries |

---

## D. What Did NOT Change (Uncle Carter data safety)

The Uncle Carter workspace's `brand_profiles.settings` row in Supabase already contains:
- `brand.name = "Uncle Carter"`
- `brand.voice = "Calm, warm..."`
- `taxonomy.subjects = [all 30 NBA teams]`
- `taxonomy.research_angles = [all 16 UC angles]`
- `prompts.script_system = SCRIPT_SYSTEM`

`mergeSettings()` in SettingsModal applies saved DB values over `DEFAULT_SETTINGS`, so the UC workspace is completely unaffected. The cleaned defaults only apply to **new workspaces** that have never saved settings.

---

## E. What Remains Open

| Item | Notes |
|---|---|
| Research angles empty for new workspaces | `research-stories.js` will pick a random angle from `[]` (angle = ""). New workspaces need to configure angles in Settings → Brand. A future onboarding prompt should propose angles. |
| `cost_center` not yet populated by callers | `logAiCall` accepts it but no caller passes it yet. Populate during Sprint 4 when tagging is meaningful. |
| `cost_events` has no UI | Table and API layer exist. UI (spending tracker in Settings) deferred. |
| Workspace creation UI in Settings | Carried over from Sprint 2. Only available from the no-workspace screen. |
| `workspace_members` update policy (role changes) | No update policy — role changes require Supabase dashboard. Carried over from Sprint 1. |
| `user_id` backfill in workspace_members | Backfill SQL in Sprint 2 migration, Section 4 (manual, optional). |
| LLM script path always Anthropic | `runner.js` ignores `settings.providers.script.provider`. Not changed. |
| S3/GCS storage routes | Not implemented. |
| Rate limiting `/api/provider-call` | Not rate-limited. |
| Billing / subscription gating | Explicitly out of scope. |

---

## F. Build / Lint Results

```
> uc-pipeline@3.23.0 build
> next build

✓ Compiled successfully
✓ Generating static pages (11/11)

Route (app)                              Size     First Load JS
┌ ○ /                                    200 kB          287 kB
├ ƒ /api/agent                           0 B                0 B
├ ƒ /api/claude                          0 B                0 B
├ ƒ /api/provider-call                   0 B                0 B
├ ƒ /api/provider-config                 0 B                0 B
├ ƒ /api/workspace                       0 B                0 B
└ ƒ /api/workspace-members               0 B                0 B
```

No TypeScript or lint errors. No warnings.

---

## G. Manual Steps Required in Supabase / Vercel

### Supabase (required)

1. Open Supabase → SQL Editor
2. Paste and run `supabase-sprint3-cost-logging.sql` (Sections 1–3)
3. Confirm columns: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_calls' AND column_name IN ('cost_center','cost_category');`
4. Confirm table: `SELECT tablename FROM pg_tables WHERE tablename = 'cost_events';`

### Vercel (none required)

No new environment variables.

---

## H. Risks and Uncertainties

| Risk | Severity | Notes |
|---|---|---|
| DEFAULT_SETTINGS cleared — existing UC workspace unaffected | None | mergeSettings() applies DB row over defaults. UC profile in DB has all values set. |
| New workspaces get empty research angles | Low | Research still works; AI gets no angle hint and picks freely. Acceptable until onboarding proposes angles. |
| `not_implemented` save block is UI-only | Low | API route itself will also 501 on call, so server is still protected. UI block is UX improvement. |
| `cost_events` table RLS requires `is_workspace_member()` | None | Function already deployed since Sprint 1. |

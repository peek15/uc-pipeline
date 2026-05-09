# Commercial Hardening Sprint 1
**Date:** 2026-05-09  
**Version:** 3.20.8 → 3.21.0  
**Build result:** ✅ Clean — 0 errors, 0 warnings  

---

## A. Files Changed

| File | Change |
|---|---|
| `next.config.js` | Removed `productionBrowserSourceMaps: true` |
| `src/components/SettingsView.jsx` | **Deleted** — legacy component, not imported anywhere |
| `src/components/ResearchView.jsx` | Added `tenant` prop; localStorage keys are now tenant-scoped via `tenantStorageKey()` |
| `src/app/page.js` | Pass `tenant={activeTenant}` to `ResearchView`; version bump to 3.21.0 |
| `src/app/api/claude/route.js` | Replaced `global._rateLimits` with Supabase RPC `check_rate_limit`; added `serviceClient()`; fixed missing `await` |
| `src/app/api/agent/route.js` | Replaced `global._agentLimits` with Supabase RPC `check_rate_limit`; fixed missing `await` |
| `src/app/api/workspace-members/route.js` | **New** — GET/POST/DELETE handler for workspace member management via service role |
| `src/components/SettingsModal.jsx` | Added `WorkspaceMembersPanel` component; replaced static hardcoded member list with live Supabase-backed panel |
| `src/components/ProvidersSection.jsx` | Added `not_implemented: true` flag to PlayHT, MidJourney, DALL-E, Shutterstock, S3, GCS; select renders them disabled with "(not implemented)" label; warning banner shown when one is selected |
| `package.json` | Version 3.21.0 |
| `package-lock.json` | Version 3.21.0 |
| `supabase-sprint1-migration.sql` | **New** — migration covering rate_limit_events table, check_rate_limit function, workspace_members insert/delete policies, and seed + tighten instructions |

---

## B. SQL / Migrations to Run

**File:** `supabase-sprint1-migration.sql`  
Run this in Supabase → SQL Editor. It is safe to rerun.

### What the migration does

1. **Creates `rate_limit_events` table** — shared across all serverless instances; indexed on `(user_id, endpoint, created_at)`.
2. **Creates `check_rate_limit` RPC function** — atomically counts + inserts events. Returns `true` = allowed, `false` = rate limited. Auto-prunes events older than 2× the window to keep the table small.
3. **Adds `workspace_members` INSERT policy** — allows:
   - Any authenticated user to add themselves to the default workspace (bootstrapping).
   - Owners/admins to add others to workspaces they belong to.
4. **Adds `workspace_members` DELETE policy** — allows owners/admins to remove members.

### Manual step required after migration (CRITICAL)

Run **Section 3** of the migration file manually to seed yourself as workspace owner:

```sql
INSERT INTO workspace_members (workspace_id, email, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'your-email@peekmedia.cc',
  'owner'
)
ON CONFLICT (workspace_id, email) DO UPDATE SET role = 'owner';
```

**Alternatively:** open Settings → Workspace in the app. The new `WorkspaceMembersPanel` will show "No members seeded yet" with an Add Member form. Add yourself as Owner there.

### Optional second step — tighten RLS fully

After confirming you can still load the app after the seed step, run the commented-out Section 3b SQL to remove the all-zeros workspace bypass from all table policies. **Do not run this before confirming your own membership is seeded.**

---

## C. What Was Fixed

| Issue | Fix |
|---|---|
| Full source maps shipped to production browsers | Removed `productionBrowserSourceMaps: true` from `next.config.js` |
| `SettingsView.jsx` stale + hardcoded UC defaults | Deleted the file; `SettingsModal.jsx` is the only settings component |
| Research results not tenant-scoped — cross-brand contamination | `ResearchView` now derives `resKey` and `scoresKey` via `tenantStorageKey()`; reloads on tenant switch via `useEffect([resKey])` |
| `global._rateLimits` / `global._agentLimits` non-functional on Vercel | Replaced with Supabase `check_rate_limit` RPC in both `/api/claude` and `/api/agent`; both call sites now correctly `await` the async function |
| Workspace members UI was entirely static / hardcoded | New `WorkspaceMembersPanel` fetches from `/api/workspace-members`, shows live list, supports add + remove for owner/admin role |
| No insert/delete policies on `workspace_members` | Migration adds both policies with correct role checks |
| PlayHT, MidJourney, DALL-E, Shutterstock, S3, GCS selectable as live providers | Provider constants now carry `not_implemented: true`; UI disables them in the select and shows a warning banner when one is selected |

---

## D. What Remains Open

| Item | Notes |
|---|---|
| Default workspace RLS all-zeros bypass | Still active until Section 3 seed + Section 3b tighten SQL is run manually in Supabase. Cannot be automated without knowing the user's UUID at deploy time. |
| LLM script path is always Anthropic | `runner.js` ignores `settings.providers.script.provider`. The OpenAI selector in Settings has no effect. Not changed in this sprint. |
| S3/GCS storage routes still missing | No `/api/storage-upload` server route exists. S3/GCS are now marked not_implemented in the UI. |
| `workspace_members` update policy (role changes) | No update policy added — changing a member's role requires direct Supabase dashboard access for now. |
| Billing / subscription gating | Explicitly out of scope for this sprint. |
| `web-search.js` tool status | Listed as "unknown" in audit — not investigated in this sprint. |
| Performance snapshot time-series chart | Not in scope. |
| Rate limiting for `/api/provider-call` | Not yet rate-limited. Low priority: already requires auth + service role call. |

---

## E. Build / Lint Results

```
> uc-pipeline@3.21.0 build
> next build

✓ Compiled successfully
✓ Generating static pages (10/10)

Route (app)                         Size     First Load JS
┌ ○ /                               200 kB          287 kB
├ ƒ /api/agent                       0 B                0 B
├ ƒ /api/claude                      0 B                0 B
├ ƒ /api/provider-call               0 B                0 B
├ ƒ /api/provider-config             0 B                0 B
└ ƒ /api/workspace-members           0 B                0 B   ← new
```

No TypeScript or lint errors. No warnings.  
`npm run lint` is not configured in this repo (`package.json` has no lint script).

---

## F. Manual Steps Required in Supabase / Vercel

### Supabase (required)

1. Open Supabase → SQL Editor
2. Paste and run `supabase-sprint1-migration.sql` (Sections 1–2 only first)
3. Confirm: `SELECT proname FROM pg_proc WHERE proname = 'check_rate_limit';` returns one row
4. Seed your own membership (Section 3a) — either via SQL or via Settings → Workspace in the app
5. Test: load the app, confirm Pipeline and Research tabs still work
6. When confirmed: run Section 3b SQL to remove the all-zeros RLS bypass

### Vercel (none required for this sprint)

No new environment variables were introduced. Existing env vars (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`) are unchanged.

---

## G. Risks and Uncertainties

| Risk | Severity | Notes |
|---|---|---|
| `check_rate_limit` RPC missing until migration runs | Low | Both routes fail open (`return false`) if the RPC is unavailable — requests are allowed, not blocked. No regression. |
| Research localStorage key change on upgrade | Low | Existing users will have a fresh (empty) research results panel after the key scope changes. Old unscoped keys remain in browser storage but are no longer read. This is intentional and safe. |
| WorkspaceMembersPanel requires service role key | Low | If `SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel env, the API route throws 500. This is pre-existing behavior — the Settings panel shows a load error instead of crashing the app. |
| workspace_members self-seed via UI allows any @peekmedia.cc user to add themselves to default workspace | Medium | This is required for bootstrapping. After the owner seeds themselves and Section 3b is applied, this path becomes gated by membership check. Until then, any domain user can self-seed. Document and communicate the two-step process. |
| Deleting `SettingsView.jsx` | None | Confirmed by grep: no other file imports it. Build passes with it removed. |

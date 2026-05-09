# Commercial Hardening Sprint 2
**Date:** 2026-05-09  
**Version:** 3.21.0 → 3.22.0  
**Build result:** ✅ Clean — 0 errors, 0 warnings  

---

## A. Files Changed

| File | Change |
|---|---|
| `src/lib/apiAuth.js` | **New** — centralized server-side auth helpers: `getAuthenticatedUser`, `getWorkspaceMemberRole`, `requireWorkspaceMember`, `requireWorkspaceOwnerOrAdmin` |
| `src/app/api/claude/route.js` | Replaced inline `authenticate()` + `ALLOWED_DOMAIN` with `getAuthenticatedUser()` from apiAuth |
| `src/app/api/agent/route.js` | Replaced inline `authenticate()` + `ALLOWED_DOMAIN`; removed `BRAND_PROFILE_ID` hardcoded fallback; `loadLLMKey` skips Supabase lookup when `profileId` is null; GET handler no longer gates on domain; POST `profileId` defaults to `null` |
| `src/app/api/provider-call/route.js` | Replaced inline `authenticate()` + `ALLOWED_DOMAIN` with `getAuthenticatedUser()` |
| `src/app/api/workspace-members/route.js` | Replaced inline `authenticate()` + `ALLOWED_DOMAIN` with `getAuthenticatedUser()` |
| `src/app/api/workspace/route.js` | **New** — POST handler: creates workspace + owner `workspace_members` row atomically via service role |
| `src/lib/auth.js` | Removed `ALLOWED_DOMAIN` constant and `hd` Google OAuth param; `isEmailAllowed()` now always returns `true` (access gated by workspace membership) |
| `src/lib/db.js` | Added `getWorkspaces()` and `createWorkspace(name)` |
| `src/app/page.js` | Auth effect: removed domain check; added workspace state + loading effect; brand reset when workspace switches; "no workspace access" guard; workspace selector in sidebar; version 3.22.0 |
| `src/components/LoginScreen.jsx` | Replaced "Restricted to @peekmedia.cc accounts" with generic "Sign in with your Google account" |
| `package.json` | Version 3.22.0 |
| `supabase-sprint2-workspace-auth.sql` | **New** — workspaces INSERT policy, email + user_id indexes on workspace_members, optional user_id backfill |

---

## B. SQL / Migrations to Run

**File:** `supabase-sprint2-workspace-auth.sql`  
Run in Supabase → SQL Editor. Safe to rerun.

### What the migration does

1. **`workspaces` INSERT policy** — allows any authenticated user to create a workspace (the `/api/workspace` server route always uses service role, but this policy covers edge cases and future direct client use).
2. **`idx_workspace_members_email` index** — speeds up the `is_workspace_member()` function for email-based lookups (users added before first login have no `user_id`).
3. **`idx_workspace_members_user_id` index** — speeds up `user_id`-based lookups (WHERE user_id IS NOT NULL).

### Optional step (commented out in Section 4)

After all invited users have logged in at least once, run the `UPDATE workspace_members SET user_id = ...` backfill to link membership rows to `auth.users.id` via email match. This makes future lookups faster and avoids email-only fallback queries.

---

## C. What Was Fixed

| Issue | Fix |
|---|---|
| All API routes gated by `@peekmedia.cc` email domain | Replaced `ALLOWED_DOMAIN` domain checks in all 4 routes with `getAuthenticatedUser()` from `src/lib/apiAuth.js` |
| Hardcoded Uncle Carter `BRAND_PROFILE_ID` fallback in `/api/agent` | Removed constant; `profileId` defaults to `null`; `loadLLMKey` skips Supabase lookup when `null`, falls through to env keys |
| Google OAuth forced `hd` param restricting to one Google Workspace | Removed `hd: ALLOWED_DOMAIN` from `signInWithGoogle()` options |
| Login screen showed "@peekmedia.cc accounts only" | Replaced with generic "Sign in with your Google account" |
| No workspace switching in sidebar | Added workspace selector (visible when user belongs to > 1 workspace) above brand selector |
| No "no access" state for users with no workspace memberships | After workspace load, shows "No workspace access" screen with option to create a workspace or sign out |
| No way to create new workspaces | New `/api/workspace` route + `createWorkspace()` client helper; available from the no-access screen and (future) settings |
| Brand selector showed wrong brands after workspace switch | `getBrandProfiles` callback now resets `brand_profile_id` to first brand in new workspace when the current ID isn't found |

---

## D. Auth Model After Sprint 2

```
Before: Google sign-in → domain check (@peekmedia.cc) → app
After:  Google sign-in → any Google account → workspace_members check → data scoped to workspace
```

- **Login**: Any Google account can sign in. No `hd` restriction.
- **API routes**: All routes verify JWT via Supabase anon key. No domain check. Data reads/writes are scoped by RLS (`is_workspace_member`).
- **No workspace**: Users with no `workspace_members` row see a "No workspace access" screen and can either create a workspace or ask an owner to add them.
- **Multi-workspace**: Users with multiple workspaces see a workspace selector in the sidebar. Switching workspace reloads brand profiles and auto-selects the first brand in the new workspace.

---

## E. What Remains Open

| Item | Notes |
|---|---|
| Workspace creation UI in Settings | Currently only available from the "no workspace" screen. A full Settings → Workspace → "New workspace" form was not added in this sprint. |
| `workspace_members` update policy (role changes) | No update policy — role changes require Supabase dashboard access. Carried over from Sprint 1. |
| `user_id` backfill in workspace_members | Members added by email before first login have no `user_id`. Backfill SQL provided in Section 4 of migration (manual, optional). |
| LLM script path always Anthropic | `runner.js` ignores `settings.providers.script.provider`. Not changed. |
| S3/GCS storage routes | Marked not_implemented in Sprint 1. Not changed. |
| Rate limiting for `/api/provider-call` | Not rate-limited. Low priority. |
| Billing / subscription gating | Explicitly out of scope. |

---

## F. Build / Lint Results

```
> uc-pipeline@3.22.0 build
> next build

✓ Compiled successfully
✓ Generating static pages (11/11)

Route (app)                              Size     First Load JS
┌ ○ /                                    200 kB          288 kB
├ ƒ /api/agent                           0 B                0 B
├ ƒ /api/claude                          0 B                0 B
├ ƒ /api/provider-call                   0 B                0 B
├ ƒ /api/provider-config                 0 B                0 B
├ ƒ /api/workspace                       0 B                0 B   ← new
└ ƒ /api/workspace-members               0 B                0 B
```

No TypeScript or lint errors. No warnings.

---

## G. Manual Steps Required in Supabase / Vercel

### Supabase (recommended)

1. Open Supabase → SQL Editor
2. Paste and run `supabase-sprint2-workspace-auth.sql` (Sections 1 + 3)
3. Confirm: `SELECT policyname FROM pg_policies WHERE tablename = 'workspaces';` — should include "Authenticated users create workspaces"
4. Confirm: `SELECT indexname FROM pg_indexes WHERE tablename = 'workspace_members';` — should include `idx_workspace_members_email`
5. After all invited users have logged in: run Section 4 backfill SQL to link `user_id` in `workspace_members`

### Vercel (none required)

No new environment variables. Existing vars (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`) are unchanged.

---

## H. Risks and Uncertainties

| Risk | Severity | Notes |
|---|---|---|
| Any Google account can now sign in | Low–Medium | Gated entirely by `workspace_members` RLS. A user who signs in but is not a member sees no data and gets the "No workspace access" screen. They cannot read stories, brand profiles, or any other workspace data. |
| Existing sessions after deploy | None | The auth change is additive — existing `@peekmedia.cc` users still resolve correctly through `is_workspace_member` (they're already seeded as owners). |
| `hd` param removal | Low | Removes the Google "hint" that showed only the org's accounts on the sign-in page. Any Google account can now be entered. This is intentional for multi-client use. |
| Members added by email with no `user_id` | Low | The `is_workspace_member()` function matches on both `user_id` and `email`, so new users invited by email can still sign in. The backfill SQL in Section 4 resolves the `user_id` link after first login. |

# Commercial Hardening Sprint 4
**Date:** 2026-05-10  
**Version:** 3.23.0 → 3.24.0  
**Build result:** ✅ Clean — 0 errors, 0 warnings

---

## A. Files Changed

| File | Change |
|---|---|
| `supabase-sprint4-billing.sql` | **New** — `workspace_billing` table, RLS, indexes, seed row for default workspace |
| `src/lib/billing/plans.js` | **New** — 4 plan definitions with qualitative entitlements, no locked prices |
| `src/lib/billing/entitlements.js` | **New** — `getPlanEntitlements`, `hasFeature`, `getWorkspacePlan`, `getPlanLabel`, `entitlementLabel` |
| `src/lib/billing/stripe.js` | **New** — server-only Stripe helpers: `getStripe()`, `getStripePriceId()`, `createCheckoutSession()`, `createCustomerPortalSession()`, `verifyWebhookSignature()`, `mapStripeSubscriptionToWorkspaceBilling()` |
| `src/lib/billing/db.js` | **New** — `getWorkspaceBilling()`, `normalizeBilling()`, `upsertWorkspaceBilling()`, customer/subscription ID lookups |
| `src/app/api/billing/checkout/route.js` | **New** — POST, creates Stripe checkout session; rejects enterprise with contact message |
| `src/app/api/billing/portal/route.js` | **New** — POST, creates Stripe customer portal session |
| `src/app/api/billing/webhook/route.js` | **New** — POST, verifies signature, handles 6 event types, updates workspace_billing |
| `src/components/SettingsModal.jsx` | Added `billing` to SECTIONS nav; added `BillingSection` component; added billing state/effects/handlers (all hooks above early return) |
| `package.json` | Added `stripe ^22.1.1`; version 3.24.0 |
| `package-lock.json` | Version 3.24.0 |
| `src/app/page.js` | Version 3.24.0 |

---

## B. Billing Model Before/After

```
Before: No billing state. Plan = "Internal" (hardcoded in workspace section).
After:  workspace_billing table links each workspace to a plan_key and Stripe state.
        New workspaces default to studio_starter / trialing until a checkout completes.
        Stripe webhook keeps billing state current after payment events.
```

---

## C. SQL Migration to Run

**File:** `supabase-sprint4-billing.sql`

Run in Supabase → SQL Editor. Safe to rerun.

### What it does

1. Creates `workspace_billing` table (one row per workspace, FK to workspaces)
2. Adds unique indexes on `stripe_customer_id` and `stripe_subscription_id` (sparse — only when set)
3. Adds indexes on `plan_key` and `subscription_status` for analytics queries
4. Enables RLS:
   - Workspace members can SELECT their own workspace's billing row
   - All writes (INSERT/UPDATE) restricted to service role (used by API routes and webhook)
5. Seeds Uncle Carter default workspace with `plan_key=studio_starter`, `subscription_status=manual`

### Verify after running

```sql
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'workspace_billing';
SELECT indexname FROM pg_indexes WHERE tablename = 'workspace_billing';
SELECT workspace_id, plan_key, subscription_status FROM workspace_billing;
```

---

## D. Plan Config and Why Prices Are Not Locked

`src/lib/billing/plans.js` defines 4 plans:

| Key | Label | Stripe price env keys |
|---|---|---|
| `studio_starter` | Studio Starter | `STRIPE_PRICE_STARTER_MONTHLY` / `STRIPE_PRICE_STARTER_ANNUAL` |
| `studio_growth`  | Studio Growth  | `STRIPE_PRICE_GROWTH_MONTHLY`  / `STRIPE_PRICE_GROWTH_ANNUAL`  |
| `studio_scale`   | Studio Scale   | `STRIPE_PRICE_SCALE_MONTHLY`   / `STRIPE_PRICE_SCALE_ANNUAL`   |
| `enterprise`     | Enterprise     | None — manual/custom           |

Each plan has:
- `public_price_locked: false` — prices are explicitly not locked
- `suggested_launch_price_note` — internal hypothesis note, never shown in product UI
- Qualitative entitlements only (`brand_profile_level`, `studio_access_level`, `reporting_level`, `paid_ads_mode`, `team_features_level`, `priority_processing`)

**Why prices are not hardcoded:** Pricing hypotheses are under commercial review. Final amounts come from Stripe price IDs configured via environment variables. Product logic references plan keys and Stripe env var names, never specific euro/dollar amounts.

---

## E. Environment Variables Required for Stripe Actions

```
# Required for any billing action
STRIPE_SECRET_KEY=sk_live_...

# Required for webhook signature verification
STRIPE_WEBHOOK_SECRET=whsec_...

# Required for Stripe Checkout (one per plan × period)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_SCALE_MONTHLY=price_...
STRIPE_PRICE_SCALE_ANNUAL=price_...

# Optional — if needed for client-side Stripe.js (not currently used)
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**The app builds and runs without any of these set.** Missing vars throw a clear runtime error only when a billing action (checkout, portal, webhook) is invoked.

---

## F. Stripe Setup Steps

1. Create a Stripe account (or use test mode)
2. Create products and prices in the Stripe dashboard (or via CLI)
3. Set the price IDs as env vars in Vercel (`vercel env add`)
4. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
5. Register the webhook endpoint in Stripe dashboard:
   - URL: `https://your-domain.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
6. For local testing: `stripe listen --forward-to localhost:3000/api/billing/webhook`
7. Run `supabase-sprint4-billing.sql` in Supabase SQL Editor

---

## G. API Routes Added

### `POST /api/billing/checkout`

| Field | Description |
|---|---|
| Auth | Bearer JWT — workspace owner or admin only |
| Body | `{ workspace_id, plan_key, billing_period }` |
| Enterprise | Returns `{ contact: true, message }` — no Stripe call |
| Success | Returns `{ url, session_id }` — redirect to `url` |
| Errors | 401 Unauthorized · 403 Not owner/admin · 503 Stripe not configured / price missing |

### `POST /api/billing/portal`

| Field | Description |
|---|---|
| Auth | Bearer JWT — workspace owner or admin only |
| Body | `{ workspace_id }` |
| Requires | Existing `stripe_customer_id` in workspace_billing |
| Success | Returns `{ url }` — redirect to Stripe portal |
| Errors | 401 · 403 · 404 No customer · 503 Stripe not configured |

### `POST /api/billing/webhook`

| Field | Description |
|---|---|
| Auth | Stripe-Signature header (no user auth) |
| Events handled | `checkout.session.completed` · `customer.subscription.created/updated/deleted` · `invoice.payment_succeeded/failed` |
| Writes | Service role upsert to `workspace_billing` |
| Workspace resolution | First by `metadata.workspace_id`, then by `stripe_customer_id` lookup |

---

## H. Settings → Billing UI Behavior

- Settings → **Billing** tab added between Intelligence and Danger Zone
- Shows current plan, subscription status (with color), billing period, billing email, period end, trial end
- Shows qualitative entitlement table for current plan
- Shows plan picker with all 4 plans
- Owner/admin:
  - Non-current non-enterprise plans show **Upgrade** button → calls `/api/billing/checkout` → redirects to Stripe
  - Enterprise plan shows **Contact us** button → calls checkout API → shows contact message
  - If `stripe_customer_id` exists: **Manage subscription & invoices** button → calls `/api/billing/portal` → redirects to Stripe portal
- Non-owner/admin members: sees info only, no billing action buttons
- Error/success messages inline, dismissable
- Loading states on all async actions
- **No exact credit counts or usage limits displayed** — footer note: "Final usage limits are not shown here. Fair-use monitoring is active."

---

## I. Webhook Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Creates/updates billing row: plan_key, status=active, customer_id, subscription_id, billing_email |
| `customer.subscription.created` | Upserts subscription state; resolves workspace by metadata or customer ID |
| `customer.subscription.updated` | Same as above; maps Stripe status to local status |
| `customer.subscription.deleted` | Sets status=canceled |
| `invoice.payment_succeeded` | Sets status=active |
| `invoice.payment_failed` | Sets status=past_due |

---

## J. What Is Intentionally Not Implemented

| Item | Decision |
|---|---|
| Final prices in product logic | Prices come from env vars / Stripe. No € amounts in code. |
| Usage-based billing or credits | Deferred — cost_events table exists for future join |
| Studio module | Out of scope for all sprints so far |
| CRM, e-invoicing, accounting | Out of scope |
| Annual billing UI toggle | Monthly-only shown in this sprint; annual URL param deferred |
| Billing webhook event for `payment_intent.*` | Not needed for subscriptions; can add if one-time purchases are added |
| Hard feature gating on core workflows | Entitlements are display-only; gating deferred until pricing is locked |
| New providers | Out of scope |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Not wired — no client-side Stripe.js needed yet |

---

## K. Build / Lint Results

```
> uc-pipeline@3.24.0 build
> next build

✓ Compiled successfully
✓ Generating static pages (13/13)

Route (app)                              Size     First Load JS
┌ ○ /                                    202 kB          290 kB
├ ƒ /api/billing/checkout                0 B                0 B   ← new
├ ƒ /api/billing/portal                  0 B                0 B   ← new
├ ƒ /api/billing/webhook                 0 B                0 B   ← new
├ ƒ /api/agent                           0 B                0 B
├ ƒ /api/claude                          0 B                0 B
├ ƒ /api/provider-call                   0 B                0 B
├ ƒ /api/provider-config                 0 B                0 B
├ ƒ /api/workspace                       0 B                0 B
└ ƒ /api/workspace-members               0 B                0 B
```

No TypeScript or lint errors. No warnings.

---

## L. Manual Test Checklist

- [ ] App loads without any Stripe env vars set
- [ ] Settings opens normally
- [ ] Billing section appears in nav
- [ ] Current workspace plan and status display (UC workspace: studio_starter / manual)
- [ ] Entitlement table renders for current plan
- [ ] Plan picker shows all 4 plans
- [ ] Non-owner member sees read-only view, no action buttons
- [ ] Owner/admin sees Upgrade buttons on non-current plans
- [ ] Clicking Upgrade with no Stripe env vars shows clear error message
- [ ] Clicking Upgrade for Enterprise shows contact message (not Stripe redirect)
- [ ] Manage subscription button only appears when stripe_customer_id is set
- [ ] Portal route returns 404 error if no customer exists
- [ ] Webhook signature mismatch returns 400
- [ ] Test webhook via Stripe CLI: `stripe trigger checkout.session.completed`
- [ ] After test webhook: workspace_billing row updates in Supabase
- [ ] Research / Pipeline / Create / Calendar unaffected
- [ ] Workspace selector still works
- [ ] Brand selector still works

---

## M. Remaining Risks

| Risk | Severity | Notes |
|---|---|---|
| `workspace_billing` row missing for existing workspaces | Low | Migration seeds the default workspace. New workspaces created via `/api/workspace` don't auto-create a billing row yet — `getWorkspaceBilling` returns null, `normalizeBilling` returns safe defaults. |
| `stripe_customer_id` not linked until checkout completes | None | Portal button only renders when customer_id exists. |
| Webhook workspace resolution falls back to customer ID lookup | Low | If `metadata.workspace_id` is missing from Stripe event (e.g. manually created subscription), the fallback lookup works but requires `stripe_customer_id` to be in the table. |
| Stripe package version | Low | Using `stripe ^22.1.1`. Stripe API version pinned to `2024-11-20.acacia` in `getStripe()`. Update both together if Stripe makes breaking changes. |
| Missing Stripe env vars on Vercel | None | Deployment succeeds. Only billing actions at runtime fail, with descriptive errors. |
| `workspace_billing` RLS — member can read billing status | Accepted | By design. Members can see their workspace's plan and status. Stripe IDs are not sensitive enough to block, and this lets the UI work for all roles. |

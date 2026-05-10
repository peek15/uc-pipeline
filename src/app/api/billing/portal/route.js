// POST /api/billing/portal
// Creates a Stripe customer portal session for an existing subscriber.
// Requires: authenticated user, workspace owner or admin.

import { getAuthenticatedUser, makeServiceClient, requireWorkspaceOwnerOrAdmin } from "@/lib/apiAuth";
import { createCustomerPortalSession } from "@/lib/billing/stripe";
import { upsertWorkspaceBilling } from "@/lib/billing/db";
import { createClient } from "@supabase/supabase-js";

function ok(payload) { return Response.json(payload); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { workspace_id } = body || {};
  if (!workspace_id) return err("Missing workspace_id");

  const svc = makeServiceClient();
  const authResult = await requireWorkspaceOwnerOrAdmin(svc, user, workspace_id);
  if (authResult.error) return err(authResult.error, authResult.status);

  // Fetch billing row via service role (bypasses RLS for server-side read)
  const { data: billing, error: billingErr } = await svc
    .from("workspace_billing")
    .select("stripe_customer_id")
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  if (billingErr) {
    console.error("[billing/portal] DB read failed:", billingErr.message);
    return err("Failed to load billing record.", 500);
  }

  if (!billing?.stripe_customer_id) {
    return err("No billing account found for this workspace. Start a subscription first.", 404);
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let session;
  try {
    session = await createCustomerPortalSession({
      stripe_customer_id: billing.stripe_customer_id,
      returnUrl: `${origin}/?billing=portal_return&workspace=${workspace_id}`,
    });
  } catch (e) {
    console.error("[billing/portal] Stripe portal session failed:", e.message);
    return err(e.message, 503);
  }

  return ok({ url: session.url });
}

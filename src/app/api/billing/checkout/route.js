// POST /api/billing/checkout
// Creates a Stripe checkout session for a workspace subscription upgrade.
// Requires: authenticated user, workspace owner or admin.

import { getAuthenticatedUser, makeServiceClient, requireWorkspaceOwnerOrAdmin } from "@/lib/apiAuth";
import { getStripePriceId, createCheckoutSession } from "@/lib/billing/stripe";
import { getWorkspaceBilling } from "@/lib/billing/db";
import { PLANS } from "@/lib/billing/plans";

function ok(payload) { return Response.json(payload); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { workspace_id, plan_key, billing_period = "monthly" } = body || {};
  if (!workspace_id) return err("Missing workspace_id");
  if (!plan_key)     return err("Missing plan_key");
  if (!PLANS[plan_key]) return err(`Unknown plan: ${plan_key}`);

  if (plan_key === "enterprise") {
    return Response.json(
      { contact: true, message: "Enterprise plans require manual setup. Please contact us to get started." },
      { status: 200 }
    );
  }

  const svc = makeServiceClient();
  const authResult = await requireWorkspaceOwnerOrAdmin(svc, user, workspace_id);
  if (authResult.error) return err(authResult.error, authResult.status);

  let priceId;
  try {
    priceId = getStripePriceId(plan_key, billing_period);
  } catch (e) {
    return err(e.message, 503);
  }

  // Get existing customer ID if available
  const existing = await getWorkspaceBilling(workspace_id).catch(() => null);

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let session;
  try {
    session = await createCheckoutSession({
      priceId,
      workspaceId: workspace_id,
      userId:      user.id,
      plan_key,
      billing_period,
      billing_email:      user.email,
      stripe_customer_id: existing?.stripe_customer_id || null,
      successUrl: `${origin}/?billing=success&workspace=${workspace_id}`,
      cancelUrl:  `${origin}/?billing=cancel&workspace=${workspace_id}`,
    });
  } catch (e) {
    console.error("[billing/checkout] Stripe session creation failed:", e.message);
    return err(e.message, 503);
  }

  return ok({ url: session.url, session_id: session.id });
}

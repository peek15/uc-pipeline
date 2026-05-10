// POST /api/billing/webhook
// Stripe webhook handler. No user auth — server-to-server only.
// Verifies signature, then updates workspace_billing via service role.

import { verifyWebhookSignature, mapStripeSubscriptionToWorkspaceBilling } from "@/lib/billing/stripe";
import { makeServiceClient } from "@/lib/apiAuth";
import { upsertWorkspaceBilling, getWorkspaceBillingByCustomerId } from "@/lib/billing/db";

function ok(msg = "ok") { return Response.json({ received: true, message: msg }); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

// Disable Next.js body parsing — Stripe needs the raw body for signature verification.
export const dynamic = "force-dynamic";

export async function POST(request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return err("Missing stripe-signature header", 400);

  let rawBody;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[billing/webhook] Failed to read request body:", e.message);
    return err("Failed to read body", 400);
  }

  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (e) {
    console.error("[billing/webhook] Signature verification failed:", e.message);
    return err(`Webhook signature invalid: ${e.message}`, 400);
  }

  const svc = makeServiceClient();

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object;
        const workspace_id  = session.metadata?.workspace_id;
        const plan_key      = session.metadata?.plan_key;
        const billing_period= session.metadata?.billing_period || "monthly";
        const customer_id   = typeof session.customer === "string" ? session.customer : session.customer?.id;

        if (!workspace_id) {
          console.warn("[billing/webhook] checkout.session.completed missing workspace_id in metadata");
          break;
        }

        await upsertWorkspaceBilling(svc, workspace_id, {
          plan_key:               plan_key || "studio_starter",
          subscription_status:    "active",
          stripe_customer_id:     customer_id || null,
          stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
          billing_email:          session.customer_email || session.customer_details?.email || null,
          billing_period,
          billing_updated_at: new Date().toISOString(),
        });
        console.log(`[billing/webhook] checkout.session.completed — workspace ${workspace_id} → ${plan_key}`);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const workspace_id = subscription.metadata?.workspace_id;

        if (!workspace_id) {
          // Fall back to customer ID lookup
          const existing = await getWorkspaceBillingByCustomerId(
            svc,
            typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
          );
          if (!existing) {
            console.warn("[billing/webhook] subscription event — workspace not found for customer", subscription.customer);
            break;
          }
          const patch = mapStripeSubscriptionToWorkspaceBilling(subscription);
          await upsertWorkspaceBilling(svc, existing.workspace_id, patch);
          console.log(`[billing/webhook] ${event.type} — workspace ${existing.workspace_id} → ${patch.subscription_status}`);
          break;
        }

        const patch = mapStripeSubscriptionToWorkspaceBilling(subscription);
        await upsertWorkspaceBilling(svc, workspace_id, patch);
        console.log(`[billing/webhook] ${event.type} — workspace ${workspace_id} → ${patch.subscription_status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const workspace_id = subscription.metadata?.workspace_id;
        const target = workspace_id || (await getWorkspaceBillingByCustomerId(
          svc,
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
        ))?.workspace_id;

        if (target) {
          await upsertWorkspaceBilling(svc, target, {
            subscription_status: "canceled",
            stripe_subscription_id: subscription.id,
            billing_updated_at: new Date().toISOString(),
          });
          console.log(`[billing/webhook] subscription.deleted — workspace ${target} → canceled`);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const customer_id = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const existing = await getWorkspaceBillingByCustomerId(svc, customer_id);
        if (existing) {
          await upsertWorkspaceBilling(svc, existing.workspace_id, {
            subscription_status: "active",
            billing_updated_at: new Date().toISOString(),
          });
          console.log(`[billing/webhook] invoice.payment_succeeded — workspace ${existing.workspace_id}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customer_id = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const existing = await getWorkspaceBillingByCustomerId(svc, customer_id);
        if (existing) {
          await upsertWorkspaceBilling(svc, existing.workspace_id, {
            subscription_status: "past_due",
            billing_updated_at: new Date().toISOString(),
          });
          console.log(`[billing/webhook] invoice.payment_failed — workspace ${existing.workspace_id} → past_due`);
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge without processing
        break;
    }
  } catch (e) {
    console.error(`[billing/webhook] Error handling ${event.type}:`, e.message);
    return err(`Webhook handler error: ${e.message}`, 500);
  }

  return ok(event.type);
}

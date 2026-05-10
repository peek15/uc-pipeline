// ═══════════════════════════════════════════════════════════
// stripe.js — Server-side Stripe helpers.
//
// All functions in this file are server-only (API routes).
// None of these should be imported by client components.
//
// The app builds and runs without Stripe env vars set.
// Missing vars throw descriptive errors only at call time.
// ═══════════════════════════════════════════════════════════

import { PLANS, STRIPE_STATUS_MAP, DEFAULT_PLAN_KEY } from "./plans";

// Lazy singleton — not instantiated at import time so missing
// STRIPE_SECRET_KEY doesn't break app startup or build.
let _stripe = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing actions.");
  }
  if (!_stripe) {
    const Stripe = require("stripe");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
  }
  return _stripe;
}

export function getStripePriceId(plan_key, billing_period = "monthly") {
  const plan = PLANS[plan_key];
  if (!plan) throw new Error(`Unknown plan: ${plan_key}`);
  if (!plan.stripe_price_env) return null; // enterprise — no Stripe price
  const envKey = plan.stripe_price_env[billing_period];
  if (!envKey) throw new Error(`No price env key for plan ${plan_key} / period ${billing_period}`);
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Stripe price ID not configured. Set env var ${envKey} to enable checkout for ${plan_key} (${billing_period}).`);
  }
  return priceId;
}

export async function createCheckoutSession({
  priceId,
  workspaceId,
  userId,
  plan_key,
  billing_period,
  billing_email,
  stripe_customer_id,
  successUrl,
  cancelUrl,
}) {
  const stripe = getStripe();

  const sessionParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      workspace_id: workspaceId,
      user_id:      userId,
      plan_key,
      billing_period,
    },
    subscription_data: {
      metadata: {
        workspace_id: workspaceId,
        plan_key,
      },
    },
  };

  if (stripe_customer_id) {
    sessionParams.customer = stripe_customer_id;
  } else if (billing_email) {
    sessionParams.customer_email = billing_email;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

export async function createCustomerPortalSession({ stripe_customer_id, returnUrl }) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: stripe_customer_id,
    return_url: returnUrl,
  });
}

export function verifyWebhookSignature(payload, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured.");
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

export function mapStripeSubscriptionToWorkspaceBilling(subscription) {
  const plan_key = subscription.metadata?.plan_key || DEFAULT_PLAN_KEY;
  const status = STRIPE_STATUS_MAP[subscription.status] || subscription.status;
  return {
    plan_key,
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    billing_period: subscription.items?.data?.[0]?.price?.recurring?.interval === "year"
      ? "annual"
      : "monthly",
    billing_updated_at: new Date().toISOString(),
  };
}

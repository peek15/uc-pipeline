// ═══════════════════════════════════════════════════════════
// billing/db.js — workspace_billing read/write helpers.
//
// Client-side reads use the anon Supabase client (RLS applies).
// Server-side writes use the service role client.
// ═══════════════════════════════════════════════════════════

import { supabase } from "@/lib/db";
import { DEFAULT_PLAN_KEY } from "./plans";

// ─── Client-side read ───────────────────────────────────────

export async function getWorkspaceBilling(workspaceId) {
  if (!workspaceId) return null;
  const { data, error } = await supabase
    .from("workspace_billing")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Returns a normalized billing object with safe defaults.
export function normalizeBilling(raw) {
  return {
    plan_key:               raw?.plan_key              || DEFAULT_PLAN_KEY,
    subscription_status:    raw?.subscription_status   || "trialing",
    stripe_customer_id:     raw?.stripe_customer_id    || null,
    stripe_subscription_id: raw?.stripe_subscription_id || null,
    billing_email:          raw?.billing_email         || null,
    trial_ends_at:          raw?.trial_ends_at         || null,
    current_period_end:     raw?.current_period_end    || null,
    billing_period:         raw?.billing_period        || null,
  };
}

// ─── Server-side write (service role) ───────────────────────

export async function upsertWorkspaceBilling(svc, workspaceId, patch) {
  const { data, error } = await svc
    .from("workspace_billing")
    .upsert(
      { workspace_id: workspaceId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "workspace_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getWorkspaceBillingByCustomerId(svc, stripe_customer_id) {
  const { data, error } = await svc
    .from("workspace_billing")
    .select("workspace_id, plan_key, subscription_status")
    .eq("stripe_customer_id", stripe_customer_id)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function getWorkspaceBillingBySubscriptionId(svc, stripe_subscription_id) {
  const { data, error } = await svc
    .from("workspace_billing")
    .select("workspace_id, plan_key, subscription_status")
    .eq("stripe_subscription_id", stripe_subscription_id)
    .maybeSingle();
  if (error) return null;
  return data;
}

// ═══════════════════════════════════════════════════════════
// /api/provider-config — Server-only access to provider_secrets table.
// v3.10.0
//
// This is the ONLY place provider secrets ever leave or enter the DB.
// The route uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
// SECRETS NEVER FLOW BACK TO THE CLIENT.
//
// Endpoints (all POST):
//   action=load     → returns CONFIG only (never secrets) per brand+type
//   action=save     → upserts secrets+config (admin call)
//   action=test     → fires a test call to the provider, returns ok/error
//   action=list     → list all configured providers for a brand (config only)
//
// Auth: Verifies Supabase user session. Domain check (@peekmedia.cc).
//       Future: workspace membership check.
// ═══════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_DOMAIN            = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

// Service-role client — bypasses RLS, used only inside this file
function serviceClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function authenticate(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await supa.auth.getUser(token);
  if (error || !user) return null;
  if (!user.email?.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
  return user;
}

function ok(payload)          { return Response.json(payload); }
function err(msg, status=400) { return Response.json({ error: msg }, { status }); }

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { action, brand_profile_id, provider_type, provider_name, secrets, config } = body || {};
  if (!action) return err("Missing action");
  if (!brand_profile_id) return err("Missing brand_profile_id");

  const svc = serviceClient();

  // ── load: returns config only (NEVER secrets) ──
  if (action === "load") {
    if (!provider_type) return err("Missing provider_type");
    const { data, error } = await svc
      .from("provider_secrets")
      .select("provider_name, config, active, last_test_at, last_test_ok, last_test_error")
      .eq("brand_profile_id", brand_profile_id)
      .eq("provider_type", provider_type)
      .eq("active", true)
      .maybeSingle();
    if (error) return err(error.message, 500);
    return ok({ data: data || null });
  }

  // ── list: returns all provider configs for a brand (config only) ──
  if (action === "list") {
    const { data, error } = await svc
      .from("provider_secrets")
      .select("provider_type, provider_name, config, active, last_test_at, last_test_ok, last_test_error")
      .eq("brand_profile_id", brand_profile_id)
      .eq("active", true);
    if (error) return err(error.message, 500);
    return ok({ data: data || [] });
  }

  // ── save: upserts secrets+config ──
  if (action === "save") {
    if (!provider_type) return err("Missing provider_type");
    if (!provider_name) return err("Missing provider_name");

    // Upsert based on (brand_profile_id, provider_type) — replaces existing
    const upsertRow = {
      brand_profile_id,
      provider_type,
      provider_name,
      secrets: secrets || {},
      config:  config  || {},
      active:  true,
    };

    // Deactivate any existing active row for this (brand, type) combo first
    await svc.from("provider_secrets")
      .update({ active: false })
      .eq("brand_profile_id", brand_profile_id)
      .eq("provider_type", provider_type)
      .eq("active", true);

    const { data, error } = await svc
      .from("provider_secrets")
      .insert(upsertRow)
      .select("provider_type, provider_name, config, active")
      .single();
    if (error) return err(error.message, 500);
    return ok({ data });
  }

  // ── test: load the secret server-side, run a test call, persist result ──
  if (action === "test") {
    if (!provider_type) return err("Missing provider_type");

    const { data: row, error: loadErr } = await svc
      .from("provider_secrets")
      .select("id, provider_name, secrets, config")
      .eq("brand_profile_id", brand_profile_id)
      .eq("provider_type", provider_type)
      .eq("active", true)
      .maybeSingle();
    if (loadErr) return err(loadErr.message, 500);
    if (!row)    return err("No active provider configured", 404);

    let testResult;
    try {
      testResult = await runProviderTest(provider_type, row.provider_name, row.secrets, row.config);
    } catch (e) {
      testResult = { ok: false, error: e?.message || String(e) };
    }

    // Persist result on the row (no secrets returned)
    await svc.from("provider_secrets").update({
      last_test_at:    new Date().toISOString(),
      last_test_ok:    !!testResult.ok,
      last_test_error: testResult.error || null,
    }).eq("id", row.id);

    return ok({ data: { ok: !!testResult.ok, error: testResult.error || null, latency_ms: testResult.latency_ms || null } });
  }

  return err(`Unknown action: ${action}`);
}

// ─── Provider test runners ──────────────────────────────
// Each provider tested with a minimal call. Add new providers here.

async function runProviderTest(provider_type, provider_name, secrets, config) {
  const t0 = Date.now();

  if (provider_type === "storage") {
    return testStorage(provider_name, secrets, config, t0);
  }
  if (provider_type === "voice") {
    return testVoice(provider_name, secrets, config, t0);
  }
  return { ok: false, error: `No test handler for provider_type=${provider_type}` };
}

async function testStorage(name, secrets, config, t0) {
  if (name === "stub") {
    return { ok: true, latency_ms: 0 };
  }
  if (name === "supabase_storage") {
    const bucket = config?.bucket;
    if (!bucket) return { ok: false, error: "Missing bucket name in config" };
    const svc = serviceClient();
    const { error } = await svc.storage.from(bucket).list("", { limit: 1 });
    if (error) return { ok: false, error: error.message, latency_ms: Date.now() - t0 };
    return { ok: true, latency_ms: Date.now() - t0 };
  }
  if (name === "s3") {
    // Minimal HEAD on the bucket — we don't pull AWS SDK into the route to keep
    // the bundle small. Defer real S3 test to the storage provider module
    // (called via dynamic import in 2B). For now just check creds present.
    if (!secrets?.access_key_id || !secrets?.secret_access_key) {
      return { ok: false, error: "Missing access_key_id or secret_access_key" };
    }
    if (!config?.region || !config?.bucket) {
      return { ok: false, error: "Missing region or bucket in config" };
    }
    return { ok: true, latency_ms: 0, note: "creds present, full S3 ping deferred to client-side test" };
  }
  if (name === "gcs") {
    if (!secrets?.service_account_json) return { ok: false, error: "Missing service_account_json" };
    if (!config?.bucket)                 return { ok: false, error: "Missing bucket in config" };
    return { ok: true, latency_ms: 0, note: "creds present, full GCS ping deferred" };
  }
  return { ok: false, error: `Unknown storage provider: ${name}` };
}

async function testVoice(name, secrets, config, t0) {
  if (name === "stub") {
    return { ok: true, latency_ms: 0 };
  }
  if (name === "elevenlabs") {
    const key = secrets?.api_key;
    if (!key) return { ok: false, error: "Missing api_key" };
    try {
      // GET /v1/user — cheapest authenticated call ($0.00, just verifies key)
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": key },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `ElevenLabs ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
      }
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
    }
  }
  return { ok: false, error: `Unknown voice provider: ${name}` };
}

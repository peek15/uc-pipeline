// ═══════════════════════════════════════════════════════════
// /api/provider-config — Server-only access to provider_secrets table.
// v3.11.3 — adds visual_atmospheric + visual_licensed test handlers.
//
// This is the ONLY place provider secrets ever leave or enter the DB.
// Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
// SECRETS NEVER FLOW BACK TO THE CLIENT.
//
// Endpoints (all POST):
//   action=load     → returns CONFIG only + has_<secret_field> booleans
//   action=save     → upserts: merges new secrets with existing
//   action=test     → fires a test call, persists ok/error timestamp
//   action=list     → list all configured providers (config only)
// ═══════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_DOMAIN            = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

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

function buildHasFlags(secrets) {
  const flags = {};
  if (!secrets || typeof secrets !== "object") return flags;
  for (const k of Object.keys(secrets)) {
    if (secrets[k] != null && secrets[k] !== "") flags[`has_${k}`] = true;
  }
  return flags;
}

function filterEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v != null && v !== "") out[k] = v;
  }
  return out;
}

async function resolveWorkspaceId(svc, brandProfileId) {
  try {
    const { data } = await svc
      .from("brand_profiles")
      .select("workspace_id")
      .eq("id", brandProfileId)
      .maybeSingle();
    return data?.workspace_id || process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "00000000-0000-0000-0000-000000000001";
  } catch {
    return process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "00000000-0000-0000-0000-000000000001";
  }
}

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { action, brand_profile_id, workspace_id, provider_type, provider_name, secrets, config } = body || {};
  if (!action) return err("Missing action");
  if (!brand_profile_id) return err("Missing brand_profile_id");

  const svc = serviceClient();
  const rowWorkspaceId = workspace_id || await resolveWorkspaceId(svc, brand_profile_id);

  if (action === "load") {
    if (!provider_type) return err("Missing provider_type");
    const { data, error } = await svc
      .from("provider_secrets")
      .select("provider_name, secrets, config, active, last_test_at, last_test_ok, last_test_error")
      .eq("brand_profile_id", brand_profile_id)
      .eq("provider_type", provider_type)
      .eq("active", true)
      .maybeSingle();
    if (error) return err(error.message, 500);
    if (!data)  return ok({ data: null });
    const { secrets: rowSecrets, ...rest } = data;
    return ok({ data: { ...rest, ...buildHasFlags(rowSecrets) } });
  }

  if (action === "list") {
    const { data, error } = await svc
      .from("provider_secrets")
      .select("provider_type, provider_name, secrets, config, active, last_test_at, last_test_ok, last_test_error")
      .eq("brand_profile_id", brand_profile_id)
      .eq("active", true);
    if (error) return err(error.message, 500);
    const stripped = (data || []).map(row => {
      const { secrets: rowSecrets, ...rest } = row;
      return { ...rest, ...buildHasFlags(rowSecrets) };
    });
    return ok({ data: stripped });
  }

  if (action === "save") {
    if (!provider_type) return err("Missing provider_type");
    if (!provider_name) return err("Missing provider_name");

    const { data: existing, error: loadErr } = await svc
      .from("provider_secrets")
      .select("id, provider_name, secrets, config")
      .eq("brand_profile_id", brand_profile_id)
      .eq("provider_type", provider_type)
      .eq("active", true)
      .maybeSingle();
    if (loadErr) return err(loadErr.message, 500);

    const sameProvider = existing && existing.provider_name === provider_name;

    const mergedSecrets = sameProvider
      ? { ...(existing.secrets || {}), ...filterEmpty(secrets || {}) }
      : (secrets || {});

    const mergedConfig = config || {};

    if (existing) {
      await svc.from("provider_secrets")
        .update({ active: false })
        .eq("id", existing.id);
    }

    const { data, error } = await svc
      .from("provider_secrets")
      .insert({
        workspace_id: rowWorkspaceId, brand_profile_id, provider_type, provider_name,
        secrets: mergedSecrets, config: mergedConfig, active: true,
      })
      .select("provider_name, secrets, config, active")
      .single();
    if (error) return err(error.message, 500);

    const { secrets: returnedSecrets, ...rest } = data;
    return ok({ data: { ...rest, ...buildHasFlags(returnedSecrets) } });
  }

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

    await svc.from("provider_secrets").update({
      last_test_at:    new Date().toISOString(),
      last_test_ok:    !!testResult.ok,
      last_test_error: testResult.error || null,
    }).eq("id", row.id);

    return ok({ data: {
      ok:         !!testResult.ok,
      error:      testResult.error      || null,
      latency_ms: testResult.latency_ms || null,
    }});
  }

  return err(`Unknown action: ${action}`);
}

// ═══════════════════════════════════════════════════════════
// Provider test runners
// ═══════════════════════════════════════════════════════════

async function runProviderTest(provider_type, provider_name, secrets, config) {
  const t0 = Date.now();
  if (provider_type === "storage")            return testStorage           (provider_name, secrets, config, t0);
  if (provider_type === "voice")              return testVoice             (provider_name, secrets, config, t0);
  if (provider_type === "visual_atmospheric") return testVisualAtmospheric (provider_name, secrets, config, t0);
  if (provider_type === "visual_licensed")    return testVisualLicensed    (provider_name, secrets, config, t0);
  if (provider_type === "llm_openai")         return testLLMOpenAI         (provider_name, secrets, config, t0);
  if (provider_type === "llm_anthropic")      return testLLMAnthropic      (provider_name, secrets, config, t0);
  return { ok: false, error: `No test handler for provider_type=${provider_type}` };
}

async function testStorage(name, secrets, config, t0) {
  if (name === "stub") return { ok: true, latency_ms: 0 };
  if (name === "supabase_storage") {
    const bucket = config?.bucket;
    if (!bucket) return { ok: false, error: "Missing bucket name in config" };
    const svc = serviceClient();
    const { error } = await svc.storage.from(bucket).list("", { limit: 1 });
    if (error) return { ok: false, error: error.message, latency_ms: Date.now() - t0 };
    return { ok: true, latency_ms: Date.now() - t0 };
  }
  if (name === "s3") {
    if (!secrets?.access_key_id || !secrets?.secret_access_key) {
      return { ok: false, error: "Missing access_key_id or secret_access_key" };
    }
    if (!config?.region || !config?.bucket) {
      return { ok: false, error: "Missing region or bucket in config" };
    }
    return { ok: true, latency_ms: 0 };
  }
  if (name === "gcs") {
    if (!secrets?.service_account_json) return { ok: false, error: "Missing service_account_json" };
    if (!config?.bucket)                 return { ok: false, error: "Missing bucket in config" };
    return { ok: true, latency_ms: 0 };
  }
  return { ok: false, error: `Unknown storage provider: ${name}` };
}

async function testVoice(name, secrets, config, t0) {
  if (name === "stub") return { ok: true, latency_ms: 0 };
  if (name === "elevenlabs") {
    const key = secrets?.api_key;
    if (!key) return { ok: false, error: "Missing api_key" };
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `ElevenLabs ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
      }
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
    }
  }
  if (name === "playht") {
    const key = secrets?.api_key;
    const userId = secrets?.user_id;
    if (!key || !userId) return { ok: false, error: "Missing api_key or user_id" };
    try {
      const res = await fetch("https://api.play.ht/api/v2/voices", { headers: { "AUTHORIZATION": key, "X-USER-ID": userId } });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `PlayHT ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
      }
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
    }
  }
  return { ok: false, error: `Unknown voice provider: ${name}` };
}

// ─── NEW v3.11.3: Visual atmospheric test handlers ────────

async function testVisualAtmospheric(name, secrets, config, t0) {
  if (name === "stub") return { ok: true, latency_ms: 0 };

  if (name === "flux") {
    const token = secrets?.api_token;
    if (!token) return { ok: false, error: "Missing Replicate api_token" };
    try {
      // GET /account verifies the token without spending a credit
      const res = await fetch("https://api.replicate.com/v1/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `Replicate ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
      }
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
    }
  }

  if (name === "midjourney") {
    return { ok: false, error: "MidJourney not implemented in v3.11.x — use Flux", latency_ms: 0 };
  }

  if (name === "dalle") {
    const key = secrets?.api_key;
    if (!key) return { ok: false, error: "Missing OpenAI api_key" };
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `OpenAI ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
      }
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
    }
  }

  return { ok: false, error: `Unknown atmospheric provider: ${name}` };
}

async function testVisualLicensed(name, secrets, config, t0) {
  if (name === "stub") return { ok: true, latency_ms: 0 };

  if (name === "pexels") {
    const key = secrets?.api_key;
    if (!key) return { ok: false, error: "Missing Pexels api_key" };
    try {
      // GET /search?query=test verifies the key (Pexels has no /me endpoint)
      const res = await fetch("https://api.pexels.com/v1/search?query=basketball&per_page=1", {
        headers: { Authorization: key },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `Pexels ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
      }
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
    }
  }

  if (name === "shutterstock") {
    return { ok: false, error: "Shutterstock not implemented in v3.11.x — use Pexels", latency_ms: 0 };
  }

  return { ok: false, error: `Unknown licensed provider: ${name}` };
}

async function testLLMOpenAI(name, secrets, config, t0) {
  const key = secrets?.api_key;
  if (!key) return { ok: false, error: "Missing api_key" };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `OpenAI ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
    }
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
  }
}

async function testLLMAnthropic(name, secrets, config, t0) {
  const key = secrets?.api_key;
  if (!key) return { ok: false, error: "Missing api_key" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Anthropic ${res.status}: ${t.slice(0, 200)}`, latency_ms: Date.now() - t0 };
    }
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), latency_ms: Date.now() - t0 };
  }
}

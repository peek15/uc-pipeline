// ═══════════════════════════════════════════════════════════
// /api/provider-call — Server-side proxy for all real provider calls.
// v3.11.0
//
// Security boundary. Every real call to ElevenLabs, Replicate, Pexels,
// MidJourney, etc. goes through here. Secrets are loaded from
// provider_secrets via service role and never returned to the client.
//
// Request:
//   POST /api/provider-call
//   {
//     action: "voice.generate" | "visual.generate" | "licensed.search" | ...
//     brand_profile_id: uuid,
//     params: { ...action-specific }
//   }
//
// Response: action-specific. Binary content (audio MP3) is returned
// as base64 inside JSON because Next.js routes only return Response
// objects easily — caller decodes back to Blob.
// ═══════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_DOMAIN            = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

function serviceClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
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

async function loadProviderRow(brand_profile_id, provider_type) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("provider_secrets")
    .select("provider_name, secrets, config")
    .eq("brand_profile_id", brand_profile_id)
    .eq("provider_type", provider_type)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`Provider lookup failed: ${error.message}`);
  if (!data)  throw new Error(`No active ${provider_type} provider configured`);
  return data;
}

function ok(payload)          { return Response.json(payload); }
function err(msg, status=400) { return Response.json({ error: msg }, { status }); }

// ═══════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { action, brand_profile_id, params = {} } = body || {};
  if (!action) return err("Missing action");
  if (!brand_profile_id) return err("Missing brand_profile_id");

  try {
    if (action === "voice.generate")    return await voiceGenerate(brand_profile_id, params);
    if (action === "visual.generate")   return await visualGenerate(brand_profile_id, params);
    if (action === "licensed.search")   return await licensedSearch(brand_profile_id, params);
    return err(`Unknown action: ${action}`);
  } catch (e) {
    console.error(`[provider-call] ${action} error:`, e);
    return err(e?.message || String(e), 500);
  }
}

// ═══════════════════════════════════════════════════════════
// VOICE — text → audio MP3
// ═══════════════════════════════════════════════════════════
//
// params: { text, voice_id, language?, model_id? }
// returns: { audio_base64, mime, duration_ms?, cost_estimate, provider_name }

async function voiceGenerate(brand_profile_id, params) {
  const { text, voice_id, language = "en", model_id } = params;
  if (!text)     return err("Missing text");
  if (!voice_id) return err("Missing voice_id");

  const row = await loadProviderRow(brand_profile_id, "voice");
  const t0 = Date.now();

  if (row.provider_name === "stub") {
    // Generate 1 second of silence as placeholder MP3
    const silence = "//uQRAAAAAAAAAAAAAAAAAAAAAAA"; // tiny base64 placeholder
    return ok({
      audio_base64: silence,
      mime: "audio/mp3",
      duration_ms: 1000,
      cost_estimate: 0,
      provider_name: "stub",
      latency_ms: 0,
    });
  }

  if (row.provider_name === "elevenlabs") {
    const apiKey = row.secrets?.api_key;
    if (!apiKey) return err("ElevenLabs api_key not set");

    const cfg   = row.config || {};
    const model = model_id || cfg.model_id || "eleven_multilingual_v2";

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: "POST",
        headers: {
          "xi-api-key":   apiKey,
          "Content-Type": "application/json",
          "Accept":       "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability:        cfg.stability        ?? 0.5,
            similarity_boost: cfg.similarity_boost ?? 0.75,
            style:            cfg.style            ?? 0,
            use_speaker_boost: cfg.use_speaker_boost ?? true,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => "");
      return err(`ElevenLabs ${elevenRes.status}: ${errText.slice(0, 300)}`, 502);
    }

    const buf = await elevenRes.arrayBuffer();
    const audioBase64 = Buffer.from(buf).toString("base64");

    // Cost estimate: ElevenLabs charges per character
    // Creator plan = $22 / 100k chars => $0.00022/char
    const cost_estimate = text.length * 0.00022;

    return ok({
      audio_base64: audioBase64,
      mime: "audio/mp3",
      cost_estimate,
      provider_name: "elevenlabs",
      latency_ms: Date.now() - t0,
    });
  }

  return err(`Voice provider not implemented: ${row.provider_name}`, 501);
}

// ═══════════════════════════════════════════════════════════
// VISUAL — atmospheric (AI-generated) images
// ═══════════════════════════════════════════════════════════
//
// params: { prompt, aspect?, count? }
// returns: { images: [{ url, cost_estimate, prompt }], provider_name }

async function visualGenerate(brand_profile_id, params) {
  const { prompt, aspect = "9:16", count = 1 } = params;
  if (!prompt) return err("Missing prompt");

  const row = await loadProviderRow(brand_profile_id, "visual_atmospheric");
  const t0 = Date.now();

  if (row.provider_name === "stub") {
    return ok({
      images: Array.from({ length: count }, (_, i) => ({
        url: `https://placehold.co/720x1280/333/fff?text=stub+${i + 1}`,
        cost_estimate: 0,
        prompt,
      })),
      provider_name: "stub",
      latency_ms: 0,
    });
  }

  if (row.provider_name === "flux") {
    const apiToken = row.secrets?.api_token;
    if (!apiToken) return err("Replicate api_token not set");

    const cfg = row.config || {};
    const modelId = cfg.model_id || "black-forest-labs/flux-1.1-pro";

    // Replicate's predictions API. Fire `count` predictions in parallel.
    const aspectMap = { "9:16": "9:16", "16:9": "16:9", "1:1": "1:1" };
    const aspectStr = aspectMap[aspect] || "9:16";

    const predictions = await Promise.all(
      Array.from({ length: count }, () =>
        fetch("https://api.replicate.com/v1/models/" + modelId + "/predictions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
            "Prefer":       "wait",      // wait up to 60s for synchronous response
          },
          body: JSON.stringify({
            input: {
              prompt,
              aspect_ratio:  aspectStr,
              output_format: "png",
              output_quality: cfg.quality || 90,
              safety_tolerance: 2,
            },
          }),
        }).then(async r => {
          if (!r.ok) {
            const t = await r.text().catch(() => "");
            throw new Error(`Replicate ${r.status}: ${t.slice(0, 200)}`);
          }
          return r.json();
        })
      )
    );

    const images = predictions.map(p => ({
      url: Array.isArray(p.output) ? p.output[0] : p.output,
      cost_estimate: 0.04,    // Flux 1.1 Pro pricing
      prompt,
      replicate_id: p.id,
    })).filter(i => i.url);

    return ok({
      images,
      provider_name: "flux",
      latency_ms: Date.now() - t0,
    });
  }

  if (row.provider_name === "midjourney") {
    return err("MidJourney via PiAPI not implemented in v3.11.0 — use Flux", 501);
  }

  return err(`Visual provider not implemented: ${row.provider_name}`, 501);
}

// ═══════════════════════════════════════════════════════════
// LICENSED — real photos via Pexels / Shutterstock
// ═══════════════════════════════════════════════════════════
//
// params: { query, count?, orientation? }
// returns: { images: [{ url, photographer, source_url, cost_estimate }], provider_name }

async function licensedSearch(brand_profile_id, params) {
  const { query, count = 6, orientation = "portrait" } = params;
  if (!query) return err("Missing query");

  const row = await loadProviderRow(brand_profile_id, "visual_licensed");
  const t0 = Date.now();

  if (row.provider_name === "stub") {
    return ok({
      images: Array.from({ length: count }, (_, i) => ({
        url:           `https://placehold.co/720x1280/444/fff?text=stub+licensed+${i + 1}`,
        photographer:  "Stub Photographer",
        source_url:    "https://example.com",
        cost_estimate: 0,
      })),
      provider_name: "stub",
      latency_ms: 0,
    });
  }

  if (row.provider_name === "pexels") {
    const apiKey = row.secrets?.api_key;
    if (!apiKey) return err("Pexels api_key not set");

    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query",       query);
    url.searchParams.set("per_page",    String(Math.min(count, 80)));
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("size",        "large");

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return err(`Pexels ${res.status}: ${t.slice(0, 200)}`, 502);
    }
    const data = await res.json();
    const images = (data.photos || []).map(p => ({
      url:           p.src?.portrait || p.src?.large2x || p.src?.large,
      photographer:  p.photographer,
      source_url:    p.url,
      cost_estimate: 0,
      pexels_id:     p.id,
      width:         p.width,
      height:        p.height,
    })).filter(i => i.url);

    return ok({
      images,
      provider_name: "pexels",
      latency_ms: Date.now() - t0,
    });
  }

  if (row.provider_name === "shutterstock") {
    return err("Shutterstock not implemented in v3.11.0 — use Pexels", 501);
  }

  return err(`Licensed provider not implemented: ${row.provider_name}`, 501);
}

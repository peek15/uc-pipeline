import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAIN    = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";
const BRAND_PROFILE_ID  = process.env.NEXT_PUBLIC_DEFAULT_BRAND_PROFILE_ID || "00000000-0000-0000-0000-000000000001";

async function authenticate(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  if (!user.email?.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
  return user;
}

function rateLimit(userId) {
  const now = Date.now();
  if (!global._agentLimits) global._agentLimits = {};
  const limits = global._agentLimits[userId] || { count: 0, reset: now + 60000 };
  if (now > limits.reset) { limits.count = 0; limits.reset = now + 60000; }
  limits.count++;
  global._agentLimits[userId] = limits;
  return limits.count > 20;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Load LLM key from provider_secrets, fall back to env var
async function loadLLMKey(provider, profileId = BRAND_PROFILE_ID) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const providerType = provider === "openai" ? "llm_openai" : "llm_anthropic";
      const { data } = await serviceClient()
        .from("provider_secrets")
        .select("secrets")
        .eq("brand_profile_id", profileId)
        .eq("provider_type", providerType)
        .eq("active", true)
        .maybeSingle();
      if (data?.secrets?.api_key) return data.secrets.api_key;
    } catch {}
  }
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || null;
  if (provider === "openai")    return process.env.OPENAI_API_KEY    || null;
  return null;
}

// ── Provider routing ──────────────────────────────────────

function transformMessagesForAnthropic(messages) {
  return messages.map(m => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map(part => {
        if (part.type === "image") {
          return { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } };
        }
        return { type: "text", text: part.text ?? "" };
      }),
    };
  });
}

function transformMessagesForOpenAI(messages, system) {
  const out = [{ role: "system", content: system }];
  for (const m of messages) {
    if (!Array.isArray(m.content)) { out.push(m); continue; }
    out.push({
      ...m,
      content: m.content.map(part => {
        if (part.type === "image") {
          return { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } };
        }
        return { type: "text", text: part.text ?? "" };
      }),
    });
  }
  return out;
}

async function callAnthropic({ model, system, messages, maxTokens, key }) {
  if (!key) throw new Error("Anthropic API key not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      system,
      messages: transformMessagesForAnthropic(messages),
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic ${res.status}`);
  }

  // Normalize SSE: emit data: {"text":"..."} for each text delta
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ text: ev.delta.text })}\n\n`));
            }
          } catch {}
        }
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch {} finally { await writer.close(); }
  })();

  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

async function callOpenAI({ model, system, messages, maxTokens, key }) {
  if (!key) throw new Error("OpenAI API key not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: transformMessagesForOpenAI(messages, system),
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI ${res.status}`);
  }

  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            const text = ev.choices?.[0]?.delta?.content;
            if (text) await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } catch {}
        }
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch {} finally { await writer.close(); }
  })();

  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

// GET — return which providers are available for this tenant
// Checks Supabase provider_secrets first, falls back to env vars
export async function GET(request) {
  let anthropic = !!process.env.ANTHROPIC_API_KEY;
  let openai    = !!process.env.OPENAI_API_KEY;

  const url       = new URL(request.url);
  const profileId = url.searchParams.get("brand_profile_id") || BRAND_PROFILE_ID;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (token && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const anonClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (user?.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
        const { data } = await serviceClient()
          .from("provider_secrets")
          .select("provider_type, secrets")
          .eq("brand_profile_id", profileId)
          .in("provider_type", ["llm_openai", "llm_anthropic"])
          .eq("active", true);
        if (data) {
          for (const row of data) {
            if (row.provider_type === "llm_anthropic" && row.secrets?.api_key) anthropic = true;
            if (row.provider_type === "llm_openai"    && row.secrets?.api_key) openai    = true;
          }
        }
      }
    } catch {}
  }

  return Response.json({ anthropic, openai });
}

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rateLimit(user.id)) return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });

  const { provider = "anthropic", model = "claude-sonnet-4-6", messages = [], system = "", maxTokens = 700, brand_profile_id } = await request.json();
  const profileId = brand_profile_id || BRAND_PROFILE_ID;

  try {
    const key = await loadLLMKey(provider, profileId);
    if (provider === "openai") return await callOpenAI({ model, system, messages, maxTokens, key });
    return await callAnthropic({ model, system, messages, maxTokens, key });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

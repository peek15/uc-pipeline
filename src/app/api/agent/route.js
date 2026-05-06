import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

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

async function callAnthropic({ model, system, messages, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

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

async function callOpenAI({ model, system, messages, maxTokens }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");

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

// GET — return which providers are configured (client uses this to hide unavailable models)
export async function GET() {
  return Response.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai:    !!process.env.OPENAI_API_KEY,
  });
}

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rateLimit(user.id)) return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });

  const { provider = "anthropic", model = "claude-sonnet-4-6", messages = [], system = "", maxTokens = 700 } = await request.json();

  try {
    if (provider === "openai") return await callOpenAI({ model, system, messages, maxTokens });
    return await callAnthropic({ model, system, messages, maxTokens });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

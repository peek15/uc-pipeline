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
  if (!global._rateLimits) global._rateLimits = {};
  const limits = global._rateLimits[userId] || { count: 0, reset: now + 60000 };
  if (now > limits.reset) { limits.count = 0; limits.reset = now + 60000; }
  limits.count++;
  global._rateLimits[userId] = limits;
  return limits.count > 30;
}

// ─── STREAMING endpoint (/api/claude/stream via stream=true param) ───
export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rateLimit(user.id)) return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const { prompt, maxTokens = 1000, stream = false, model = "sonnet" } = await request.json();

  const modelId = model === "haiku"
    ? "claude-haiku-4-5-20251001"
    : model === "opus"
    ? "claude-opus-4-7"
    : "claude-sonnet-4-6";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        stream,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return Response.json({ error: err.error?.message || `Claude API ${res.status}` }, { status: res.status });
    }

    // ═══════════════════════════════════════════════════════════
    // Streaming — pipe SSE through, capture usage from message_start
    // + message_delta, emit a custom `usage` event so the client can
    // log cost in src/lib/ai/audit.js.
    // v3.7.0 addition — the rest of the flow is unchanged.
    // ═══════════════════════════════════════════════════════════
    if (stream) {
      const { readable, writable } = new TransformStream();
      const writer  = writable.getWriter();
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      let capturedUsage = { input_tokens: null, output_tokens: null };
      let buffer = "";

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.type === "message_start" && parsed.message?.usage) {
                    capturedUsage.input_tokens = parsed.message.usage.input_tokens;
                  }
                  if (parsed.type === "message_delta" && parsed.usage) {
                    capturedUsage.output_tokens = parsed.usage.output_tokens;
                  }
                } catch {}
              }
              await writer.write(encoder.encode(line + "\n"));
            }
          }
          // Emit custom usage event before [DONE] so runner can log cost
          const usagePayload = JSON.stringify({ type: "usage", usage: capturedUsage, model: modelId });
          await writer.write(encoder.encode(`data: ${usagePayload}\n\n`));
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        } catch {
          // best-effort — client tolerates missing usage
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type":  "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection":    "keep-alive",
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Non-streaming — original response plus usage + model.
    // v3.7.0 addition: added `usage` and `model` fields to the JSON
    // response so the client runner can log cost per call.
    // ═══════════════════════════════════════════════════════════
    const data = await res.json();
    let text = "";
    for (const block of data.content || []) {
      if (block.type === "text" && block.text) text += block.text + "\n";
    }
    return Response.json({
      text:  text.trim(),
      usage: data.usage || { input_tokens: null, output_tokens: null },
      model: modelId,
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

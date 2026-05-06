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

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rateLimit(user.id)) return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const { messages = [], system = "", maxTokens = 600, stream = true } = await request.json();

  const body = {
    model:      "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages,
    stream,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return Response.json({ error: err.error?.message || `Claude API ${res.status}` }, { status: res.status });
    }

    if (stream) {
      const { readable, writable } = new TransformStream();
      const writer  = writable.getWriter();
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
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
              await writer.write(encoder.encode(line + "\n"));
            }
          }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        } catch {} finally {
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

    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return Response.json({ text });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

export async function POST(request) {
  // ─── AUTH CHECK ───
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  if (!user.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return Response.json({ error: "Access restricted" }, { status: 403 });
  }

  // ─── RATE LIMIT (simple in-memory) ───
  // In production, use Redis or similar. This prevents basic abuse.
  const now = Date.now();
  if (!global._rateLimits) global._rateLimits = {};
  const userKey = user.id;
  const userLimits = global._rateLimits[userKey] || { count: 0, reset: now + 60000 };

  if (now > userLimits.reset) {
    userLimits.count = 0;
    userLimits.reset = now + 60000;
  }

  userLimits.count++;
  global._rateLimits[userKey] = userLimits;

  if (userLimits.count > 30) { // Max 30 requests per minute per user
    return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });
  }

  // ─── CLAUDE API CALL ───
  const { prompt, maxTokens = 1000 } = await request.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return Response.json(
        { error: err.error?.message || `Claude API ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    let text = "";
    for (const block of data.content || []) {
      if (block.type === "text" && block.text) text += block.text + "\n";
    }

    return Response.json({ text: text.trim() });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";
import { estimateCost } from "@/lib/ai/costs";

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

// ── Tool definitions ──────────────────────────────────────

const VALID_CATEGORIES = ["research","quality","calendar","production","performance","prediction","memory","debug"];

const WRITE_INSIGHT_SCHEMA = {
  name: "write_insight",
  description: "Persist a durable insight into intelligence_insights for later review. Use this when you notice a pattern, anomaly, or recommendation worth recording — such as recurring AI failures, quality gate issues, or workflow gaps.",
  input_schema: {
    type: "object",
    properties: {
      category:   { type: "string", enum: VALID_CATEGORIES, description: "Insight category" },
      summary:    { type: "string", description: "Plain-text summary (max 1400 chars)" },
      confidence: { type: "number", description: "0–1 confidence score" },
    },
    required: ["category", "summary"],
  },
};

async function executeTool(name, input, profileId) {
  if (name === "write_insight") {
    const { data, error } = await serviceClient().from("intelligence_insights").insert({
      brand_profile_id: profileId,
      agent_name: "pipeline-agent",
      source: "pipeline-agent",
      category: VALID_CATEGORIES.includes(input.category) ? input.category : "debug",
      summary: String(input.summary || "").slice(0, 1400),
      payload: {},
      confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.7)),
      status: "open",
    }).select("id,summary,category").single();
    if (error) throw error;
    return { ok: true, id: data.id, category: data.category };
  }
  throw new Error(`Unknown tool: ${name}`);
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

async function callAnthropic({ model, system, messages, maxTokens, key, tools, profileId, userEmail }) {
  if (!key) throw new Error("Anthropic API key not configured");

  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const t0 = Date.now();
    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    let resolvedModel     = model;
    let succeeded = false;

    try {
      let turnMessages = transformMessagesForAnthropic(messages);

      for (let turn = 0; turn < 4; turn++) {
        const body = { model, system, messages: turnMessages, max_tokens: maxTokens, stream: true };
        if (tools?.length) body.tools = tools;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `Anthropic ${res.status}`);
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let stopReason = null;
        const textBlocks = {};
        const toolBlocks = {};

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
              if (ev.type === "message_start") {
                if (ev.message?.model)               resolvedModel      = ev.message.model;
                if (ev.message?.usage?.input_tokens)  totalInputTokens  += ev.message.usage.input_tokens;
                if (ev.message?.usage?.output_tokens) totalOutputTokens += ev.message.usage.output_tokens;
              } else if (ev.type === "content_block_start") {
                if (ev.content_block?.type === "tool_use") {
                  toolBlocks[ev.index] = { id: ev.content_block.id, name: ev.content_block.name, inputJson: "" };
                } else if (ev.content_block?.type === "text") {
                  textBlocks[ev.index] = "";
                }
              } else if (ev.type === "content_block_delta") {
                if (ev.delta?.type === "text_delta" && ev.delta.text) {
                  textBlocks[ev.index] = (textBlocks[ev.index] || "") + ev.delta.text;
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ text: ev.delta.text })}\n\n`));
                } else if (ev.delta?.type === "input_json_delta" && toolBlocks[ev.index]) {
                  toolBlocks[ev.index].inputJson += ev.delta.partial_json || "";
                }
              } else if (ev.type === "message_delta") {
                stopReason = ev.delta?.stop_reason;
                if (ev.usage?.output_tokens) totalOutputTokens += ev.usage.output_tokens;
              }
            } catch {}
          }
        }

        if (stopReason !== "tool_use") break;

        const assistantContent = [];
        for (const [, text] of Object.entries(textBlocks)) {
          if (text) assistantContent.push({ type: "text", text });
        }
        for (const [, tb] of Object.entries(toolBlocks)) {
          let input = {};
          try { input = JSON.parse(tb.inputJson); } catch {}
          assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input });
        }
        turnMessages = [...turnMessages, { role: "assistant", content: assistantContent }];

        const toolResults = [];
        for (const tb of Object.values(toolBlocks)) {
          let input = {};
          try { input = JSON.parse(tb.inputJson); } catch {}
          let result;
          try { result = await executeTool(tb.name, input, profileId); }
          catch (err) { result = { error: err.message }; }
          toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: JSON.stringify(result) });
        }
        turnMessages = [...turnMessages, { role: "user", content: toolResults }];
      }

      succeeded = true;
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (err) {
      try { await writer.write(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)); } catch {}
    } finally {
      await writer.close();
      // Log to ai_calls after stream completes
      try {
        const duration_ms = Date.now() - t0;
        await serviceClient().from("ai_calls").insert({
          type:             "agent-call",
          provider_name:    "anthropic",
          model_version:    resolvedModel,
          tokens_input:     totalInputTokens  || null,
          tokens_output:    totalOutputTokens || null,
          cost_estimate:    estimateCost(resolvedModel, totalInputTokens, totalOutputTokens),
          brand_profile_id: profileId,
          workspace_id:     null,
          user_email:       userEmail || null,
          success:          succeeded,
          duration_ms,
        });
      } catch {}
    }
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
    return await callAnthropic({ model, system, messages, maxTokens, key, tools: [WRITE_INSIGHT_SCHEMA], profileId, userEmail: user.email });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

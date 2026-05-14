import { createClient } from "@supabase/supabase-js";
import { assertGatewayBudget } from "@/lib/ai/gatewayBudget";
import { estimateCost } from "@/lib/ai/costs";
import { getAuthenticatedUser, requireWorkspaceMember } from "@/lib/apiAuth";
import { prepareGatewayMessageCall } from "@/lib/ai/gateway";
import { DEFAULT_DATA_CLASS, DEFAULT_PRIVACY_MODE } from "@/lib/privacy/privacyTypes";
import { summarizeError } from "@/lib/privacy/safeLogging";
import { retrieveWorkspaceMemory } from "@/lib/workspaceMemory";

async function authenticate(request) {
  return getAuthenticatedUser(request);
}

// Supabase-backed rate limit — works across serverless instances.
// Falls back to allowing the request if the table hasn't been migrated yet.
async function rateLimit(userId) {
  try {
    const { data, error } = await serviceClient()
      .rpc("check_rate_limit", { p_user_id: userId, p_endpoint: "agent", p_limit: 20 });
    if (error) {
      console.warn("[rate-limit] check_rate_limit RPC unavailable:", error.message);
      return false; // fail open if migration hasn't run yet
    }
    return data === false; // RPC returns false = rate limited
  } catch {
    return false; // fail open
  }
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Load LLM key from provider_secrets, fall back to env var
async function loadLLMKey(provider, profileId = null) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && profileId) {
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

const DB_READ_SCHEMA = {
  name: "db_read",
  description: "Query workspace-scoped data from whitelisted tables (stories, performance_snapshots, intelligence_insights). Use to answer deeper questions about content history, performance data, or recorded intelligence findings.",
  input_schema: {
    type: "object",
    properties: {
      table:  { type: "string", enum: ["stories", "performance_snapshots", "intelligence_insights"] },
      filter: { type: "object", description: "Equality filters. Use {\"$gt\": N}, {\"$lt\": N}, {\"$gte\": N} for comparisons." },
      limit:  { type: "integer", maximum: 100, description: "Max rows (default 50)" },
    },
    required: ["table"],
  },
};

const AUDIT_READ_SCHEMA = {
  name: "audit_read",
  description: "Read recent AI call logs or audit events. Use to diagnose failures, cost spikes, or trace what happened to a specific story.",
  input_schema: {
    type: "object",
    properties: {
      source:        { type: "string", enum: ["ai_calls", "audit_log"] },
      story_id:      { type: "string" },
      since:         { type: "string", description: "ISO 8601 timestamp" },
      failures_only: { type: "boolean" },
      limit:         { type: "integer", maximum: 100 },
    },
    required: ["source"],
  },
};

async function executeTool(name, input, profileId, workspaceId) {
  if (name === "write_insight") {
    const { data, error } = await serviceClient().from("intelligence_insights").insert({
      brand_profile_id: profileId,
      workspace_id: workspaceId || null,
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

  if (name === "db_read") {
    const { table, filter = {}, limit = 50 } = input;
    const ALLOWED = new Set(["stories", "performance_snapshots", "intelligence_insights"]);
    if (!ALLOWED.has(table)) return { error: `Table not allowed: ${table}` };
    const cap = Math.min(Number(limit) || 50, 100);
    let q = serviceClient().from(table).select("*").limit(cap).order("created_at", { ascending: false });
    if (profileId)   q = q.eq("brand_profile_id", profileId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    for (const [key, val] of Object.entries(filter || {})) {
      if (val && typeof val === "object") {
        if ("$gt"  in val) q = q.gt(key, val.$gt);
        else if ("$lt"  in val) q = q.lt(key, val.$lt);
        else if ("$gte" in val) q = q.gte(key, val.$gte);
        else if ("$lte" in val) q = q.lte(key, val.$lte);
        else if ("$neq" in val) q = q.neq(key, val.$neq);
      } else {
        q = q.eq(key, val);
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    return { rows: data || [], count: (data || []).length };
  }

  if (name === "audit_read") {
    const { source = "ai_calls", story_id, since, failures_only = false, limit = 50 } = input;
    if (!["ai_calls", "audit_log"].includes(source)) return { error: `Unknown source: ${source}` };
    const cap = Math.min(Number(limit) || 50, 100);
    if (source === "ai_calls") {
      let q = serviceClient()
        .from("ai_calls")
        .select("type,provider_name,model_version,success,error_type,error_message,created_at,duration_ms,cost_estimate,story_id")
        .order("created_at", { ascending: false })
        .limit(cap);
      if (failures_only) q = q.eq("success", false);
      if (story_id)      q = q.eq("story_id", story_id);
      if (since)         q = q.gte("created_at", since);
      if (profileId)     q = q.eq("brand_profile_id", profileId);
      const { data, error } = await q;
      if (error) throw error;
      return { rows: data || [], count: (data || []).length };
    }
    let q = serviceClient()
      .from("audit_log")
      .select("action,table_name,record_id,created_at,details")
      .order("created_at", { ascending: false })
      .limit(cap);
    if (story_id) q = q.eq("record_id", story_id);
    if (since)    q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) throw error;
    return { rows: data || [], count: (data || []).length };
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

async function callAnthropic({ model, system, messages, maxTokens, key, tools, profileId, workspaceId, userEmail, taskType, costCenter, costCategory, dataClass, privacyMode, providerPrivacyProfile, payloadHash, gatewayMetadata }) {
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
          try { result = await executeTool(tb.name, input, profileId, workspaceId); }
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
          workspace_id:     workspaceId || null,
          user_email:       userEmail || null,
          cost_center:      costCenter || null,
          cost_category:    costCategory || null,
          operation_type:    taskType || "agent-call",
          data_class:        dataClass || null,
          privacy_mode:      privacyMode || null,
          provider_privacy_profile: providerPrivacyProfile || null,
          payload_hash:      payloadHash || null,
          metadata_json:     { ...(gatewayMetadata || {}), raw_payload_logged: false },
          success:          succeeded,
          duration_ms,
        });
      } catch {}
    }
  })();

  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

async function callOpenAI({ model, system, messages, maxTokens, key, profileId, workspaceId, userEmail, taskType, costCenter, costCategory, dataClass, privacyMode, providerPrivacyProfile, payloadHash, gatewayMetadata }) {
  if (!key) throw new Error("OpenAI API key not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: transformMessagesForOpenAI(messages, system),
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
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
    const t0 = Date.now();
    let promptTokens     = 0;
    let completionTokens = 0;
    let resolvedModel    = model;
    let succeeded = false;

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
            if (ev.model)           resolvedModel    = ev.model;
            if (ev.usage?.prompt_tokens)     promptTokens     = ev.usage.prompt_tokens;
            if (ev.usage?.completion_tokens) completionTokens = ev.usage.completion_tokens;
            const text = ev.choices?.[0]?.delta?.content;
            if (text) await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } catch {}
        }
      }
      succeeded = true;
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch {} finally {
      await writer.close();
      try {
        const duration_ms = Date.now() - t0;
        // OpenAI pricing via estimateCost falls back to DEFAULT (Sonnet rates); close enough for tracking
        await serviceClient().from("ai_calls").insert({
          type:             "agent-call",
          provider_name:    "openai",
          model_version:    resolvedModel,
          tokens_input:     promptTokens     || null,
          tokens_output:    completionTokens || null,
          cost_estimate:    estimateCost(resolvedModel, promptTokens, completionTokens),
          brand_profile_id: profileId,
          workspace_id:     workspaceId || null,
          user_email:       userEmail || null,
          cost_center:      costCenter || null,
          cost_category:    costCategory || null,
          operation_type:    taskType || "agent-call",
          data_class:        dataClass || null,
          privacy_mode:      privacyMode || null,
          provider_privacy_profile: providerPrivacyProfile || null,
          payload_hash:      payloadHash || null,
          metadata_json:     { ...(gatewayMetadata || {}), raw_payload_logged: false },
          success:          succeeded,
          duration_ms,
        });
      } catch {}
    }
  })();

  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

// GET — return which providers are available for this tenant
// Checks Supabase provider_secrets first, falls back to env vars
export async function GET(request) {
  let anthropic = !!process.env.ANTHROPIC_API_KEY;
  let openai    = !!process.env.OPENAI_API_KEY;

  const url       = new URL(request.url);
  const profileId = url.searchParams.get("brand_profile_id") || null;

  const user = await authenticate(request);
  if (user && profileId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
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
    } catch {}
  }

  return Response.json({ anthropic, openai });
}

export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (await rateLimit(user.id)) return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });

  const { provider = "anthropic", model = "claude-sonnet-4-6", messages = [], system = "", maxTokens = 700, brand_profile_id, workspace_id, task_type, source_view, source_entity_type, source_entity_id, data_class = DEFAULT_DATA_CLASS, privacy_mode = DEFAULT_PRIVACY_MODE } = await request.json();
  const profileId = brand_profile_id || null;
  const workspaceId = workspace_id || null;

  try {
    const svc = serviceClient();
    if (workspaceId) {
      const member = await requireWorkspaceMember(svc, user, workspaceId);
      if (member.error) return Response.json({ error: member.error }, { status: member.status });
    }
    const workspaceMemory = workspaceId
      ? await retrieveWorkspaceMemory({ svc, workspaceId, brandProfileId: profileId, limit: 8 })
      : null;
    const systemWithMemory = appendWorkspaceMemoryToSystem(system, workspaceMemory);
    const gateway = await prepareGatewayMessageCall({
      type: "agent-call",
      providerKey: provider,
      model,
      messages,
      system: systemWithMemory,
      maxTokens,
      dataClass: data_class,
      privacyMode: privacy_mode,
      stream: true,
      context: {
        workspace_id: workspaceId,
        brand_profile_id: profileId,
        user_id: user.id,
        task_type: task_type || "general_help",
        operation_type: task_type || "agent-call",
        source_view,
        source_entity_type,
        source_entity_id,
      },
    });
    await assertGatewayBudget({
      svc,
      workspaceId,
      operationType: gateway.taskType || task_type || "agent-call",
    });
    const key = await loadLLMKey(provider, profileId);
    const memoryMetadata = workspaceMemory?.summary ? {
      workspace_memory_used: true,
      workspace_memory_count: workspaceMemory.memories?.length || 0,
      workspace_memory_ids: (workspaceMemory.memories || []).map(item => item.id).filter(Boolean).slice(0, 12),
      workspace_memory_source_groups: workspaceMemory.source_groups || {},
    } : {};
    const common = {
      model: gateway.model,
      system: gateway.system,
      messages: gateway.messages,
      maxTokens: gateway.maxTokens,
      key,
      profileId,
      workspaceId,
      userEmail: user.email,
      taskType: gateway.taskType,
      costCenter: gateway.costFields.cost_center,
      costCategory: gateway.costFields.cost_category,
      dataClass: gateway.dataClass,
      privacyMode: gateway.privacyMode,
      providerPrivacyProfile: gateway.providerPrivacyProfile,
      payloadHash: gateway.payloadHash,
      gatewayMetadata: { ...(gateway.metadata || {}), ...memoryMetadata },
    };
    if (provider === "openai") return await callOpenAI(common);
    return await callAnthropic({ ...common, tools: [WRITE_INSIGHT_SCHEMA, DB_READ_SCHEMA, AUDIT_READ_SCHEMA] });
  } catch (err) {
    const safe = summarizeError(err);
    const status = err.code === "PROVIDER_PRIVACY_BLOCKED" || err.code === "D4_SECRET_BLOCKED"
      ? 403
      : err.code === "AI_GATEWAY_BUDGET_BLOCKED"
      ? 429
      : 500;
    return Response.json({ error: safe.error_message, error_type: safe.error_type }, { status });
  }
}

function appendWorkspaceMemoryToSystem(system, memory) {
  if (!memory?.summary) return system;
  return `${system || ""}

Durable workspace memory:
${memory.summary}

Use this memory as advisory context about approved strategy, repeated corrections, programme intent, and risk patterns. Current user instructions and current screen context outrank memory. Do not claim memory as a live external source.`;
}

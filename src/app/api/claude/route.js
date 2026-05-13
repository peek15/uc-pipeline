import { createClient } from "@supabase/supabase-js";
import { assertGatewayBudget } from "@/lib/ai/gatewayBudget";
import { getAuthenticatedUser, requireWorkspaceMember } from "@/lib/apiAuth";
import { prepareGatewayPromptCall } from "@/lib/ai/gateway";
import { DEFAULT_DATA_CLASS, DEFAULT_PRIVACY_MODE } from "@/lib/privacy/privacyTypes";
import { summarizeError } from "@/lib/privacy/safeLogging";

async function authenticate(request) {
  return getAuthenticatedUser(request);
}

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Supabase-backed rate limit — works across serverless instances.
// Falls back to allowing the request if the table hasn't been migrated yet.
async function rateLimit(userId) {
  const svc = serviceClient();
  if (!svc) return false; // no service key — fail open
  try {
    const { data, error } = await svc.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: "claude",
      p_limit: 30,
    });
    if (error) {
      console.warn("[rate-limit] check_rate_limit RPC unavailable:", error.message);
      return false; // fail open if migration hasn't run yet
    }
    return data === false; // RPC returns false = rate limited
  } catch {
    return false; // fail open
  }
}

// ─── STREAMING endpoint (/api/claude/stream via stream=true param) ───
export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (await rateLimit(user.id)) return Response.json({ error: "Rate limited. Wait a moment." }, { status: 429 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const {
    prompt,
    maxTokens = 1000,
    stream = false,
    model = "sonnet",
    workspace_id,
    brand_profile_id,
    task_type = "legacy_claude",
    cost_center = "legacy_claude",
    cost_category = "generation",
    data_class = DEFAULT_DATA_CLASS,
    privacy_mode = DEFAULT_PRIVACY_MODE,
    operation_type = "claude",
  } = await request.json();

  const workspaceId = workspace_id || process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "00000000-0000-0000-0000-000000000001";
  const svc = serviceClient();
  if (svc) {
    const member = await requireWorkspaceMember(svc, user, workspaceId);
    if (member.error) return Response.json({ error: member.error }, { status: member.status });
  }

  try {
    const gateway = await prepareGatewayPromptCall({
      type: task_type || operation_type || "legacy_claude",
      prompt,
      maxTokens,
      model,
      stream,
      dataClass: data_class,
      privacyMode: privacy_mode,
      context: {
        workspace_id: workspaceId,
        brand_profile_id: brand_profile_id || null,
        user_id: user.id,
        task_type,
        cost_center,
        cost_category,
        operation_type,
      },
    });
    const modelId = gateway.model;
    await assertGatewayBudget({
      svc,
      workspaceId,
      operationType: gateway.taskType || operation_type,
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: gateway.maxTokens,
        stream,
        messages: gateway.messages,
      }),
    });

    if (!res.ok) {
      const providerErr = await res.json().catch(() => ({}));
      const safe = summarizeError(providerErr.error?.message || `Claude API ${res.status}`);
      return Response.json({ error: safe.error_message }, { status: res.status });
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
      gateway: gateway.metadata,
    });

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

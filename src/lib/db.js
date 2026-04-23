import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// ─── STORIES (Supabase direct — protected by RLS) ───

export async function getStories() {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertStory(story) {
  const { data, error } = await supabase
    .from("stories")
    .upsert(story, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStory(id) {
  const { error } = await supabase.from("stories").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkUpsertStories(stories) {
  const { data, error } = await supabase
    .from("stories")
    .upsert(stories, { onConflict: "id" })
    .select();
  if (error) throw error;
  return data;
}

// ─── Helper to get auth token ───
async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

// ═══════════════════════════════════════════════════════════
// CLAUDE API
//
// v3.7.0 — return shape changed. Two functions:
//
//   callClaude(prompt, maxTokens, model)
//     → string (legacy — kept for any stragglers)
//     → backwards-compatible: returns just text
//
//   callClaudeRaw(prompt, maxTokens, model)
//     → { text, usage: { input_tokens, output_tokens }, model }
//     → used by the AI runner for cost logging
//
// In new code ALWAYS go through runPrompt() in src/lib/ai/runner.js
// — never call these directly. These exist only for legacy shim
// and for the runner itself to dispatch.
// ═══════════════════════════════════════════════════════════

export async function callClaudeRaw(prompt, maxTokens = 1000, model = "sonnet") {
  const token = await getToken();
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, maxTokens, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }
  const data = await res.json();
  return {
    text:  data.text  || "",
    usage: data.usage || { input_tokens: null, output_tokens: null },
    model: data.model || model,
  };
}

// Legacy shape — returns text only. Kept so nothing breaks during migration.
// Prefer runPrompt() for all new code.
export async function callClaude(prompt, maxTokens = 1000, model = "sonnet") {
  const { text } = await callClaudeRaw(prompt, maxTokens, model);
  return text;
}

// Streaming — returns full text + usage at the end
// Signature kept compatible: callClaudeStream(prompt, maxTokens, onChunk)
// Now returns { text, usage, model } instead of just text (backwards-compat
// for any caller using `const t = await callClaudeStream(...)` because a
// string is still produced — if old callers expect a string, use callClaudeStreamText)
export async function callClaudeStreamRaw(prompt, maxTokens = 1000, onChunk, model = "sonnet") {
  const token = await getToken();
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, maxTokens, stream: true, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  let usage = { input_tokens: null, output_tokens: null };
  let modelId = model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(dataStr);

        // Text deltas
        const chunk = parsed?.delta?.text || "";
        if (chunk) {
          fullText += chunk;
          if (onChunk) onChunk(fullText);
        }

        // Custom usage event from our proxy
        if (parsed.type === "usage" && parsed.usage) {
          usage = parsed.usage;
          if (parsed.model) modelId = parsed.model;
        }
      } catch {}
    }
  }

  return { text: fullText, usage, model: modelId };
}

// Legacy streaming — returns text only
export async function callClaudeStream(prompt, maxTokens = 1000, onChunk) {
  const { text } = await callClaudeStreamRaw(prompt, maxTokens, onChunk);
  return text;
}

// ─── AUDIT LOG (user actions — unchanged) ───
// For AI cost logging, see src/lib/ai/audit.js

export async function logAudit(action, storyId = null, storyTitle = null, details = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_email: user.email,
      user_name: user.user_metadata?.full_name || user.email,
      action,
      story_id: storyId,
      story_title: storyTitle,
      details,
    });
  } catch {} // Silent — audit is best-effort
}

export async function getAuditLog(limit = 50) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// ─── AIRTABLE SYNC (via server route — key stays secret) ───

export async function syncToAirtable(story) {
  try {
    const token = await getToken();
    if (!token) return;
    await fetch("/api/airtable", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(story),
    });
  } catch {
    // Silent fail — Airtable sync is best-effort
  }
}

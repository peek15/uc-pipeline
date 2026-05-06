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

// ─── CLAUDE API (via server route — key stays secret) ───

// Standard call (non-streaming) — used for research, translations, scoring
export async function callClaude(prompt, maxTokens = 1000, model = "sonnet") {
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
  return data.text;
}

// Streaming call — used for script generation
// onChunk(text) called with each new text chunk
// returns full text when done
export async function callClaudeStream(prompt, maxTokens = 1000, onChunk) {
  const token = await getToken();
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, maxTokens, stream: true, model: "sonnet" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const chunk = parsed?.delta?.text || "";
        if (chunk) {
          fullText += chunk;
          onChunk(fullText);
        }
      } catch {}
    }
  }
  return fullText;
}

// ─── RUNNER-COMPATIBLE VARIANTS (return { text, usage, model }) ───

export async function callClaudeRaw(prompt, maxTokens = 1000, model = "sonnet") {
  const token = await getToken();
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ prompt, maxTokens, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }
  const data = await res.json();
  return { text: data.text, usage: data.usage, model: data.model };
}

export async function callClaudeStreamRaw(prompt, maxTokens = 1000, onChunk, model = "sonnet") {
  const token = await getToken();
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
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
  let resolvedModel = model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "usage") {
          usage = parsed.usage;
          if (parsed.model) resolvedModel = parsed.model;
          continue;
        }
        const chunk = parsed?.delta?.text || "";
        if (chunk) { fullText += chunk; onChunk?.(fullText); }
      } catch {}
    }
  }
  return { text: fullText, usage, model: resolvedModel };
}

// ─── AUDIT LOG ───

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

// ─── Production pipeline updates (v3.11.3) ────────────────
// Used by Production tab agents to update production_status and
// related fields (visual_brief, audio_refs, visual_refs, etc).

export async function updateProductionStatus(storyId, fields) {
  if (!storyId) throw new Error("updateProductionStatus: missing storyId");
  if (!fields || typeof fields !== "object") throw new Error("updateProductionStatus: missing fields");
  const { data, error } = await supabase
    .from("stories")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", storyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

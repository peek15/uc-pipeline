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

// ─── STORIES ───

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

/**
 * v3.8.0 — update production_status + related fields atomically.
 */
export async function updateProductionStatus(storyId, patch) {
  const { error } = await supabase
    .from("stories")
    .update(patch)
    .eq("id", storyId);
  if (error) throw error;
}

// ─── BRAND PROFILES (v3.8.0) ───

export async function getBrandProfile(id) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function listBrandProfiles() {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("id, name, brief_doc")
    .order("name", { ascending: true });
  if (error) return [];
  return data || [];
}

// ─── ASSET LIBRARY (v3.8.0) ───

export async function listAssetLibrary({ brand_profile_id, type = null, language = null, active = true } = {}) {
  let q = supabase
    .from("asset_library")
    .select("*")
    .eq("brand_profile_id", brand_profile_id);
  if (active !== null) q = q.eq("active", active);
  if (type)     q = q.eq("type", type);
  if (language) q = q.eq("language", language);
  const { data, error } = await q.order("last_used_at", { ascending: false, nullsFirst: false });
  if (error) return [];
  return data || [];
}

export async function upsertAssetLibrary(asset) {
  const { data, error } = await supabase
    .from("asset_library")
    .upsert(asset, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bumpAssetUsage(asset_id) {
  // Best-effort increment of reuse_count + last_used_at
  try {
    const { data } = await supabase.from("asset_library").select("reuse_count").eq("id", asset_id).single();
    const next = (data?.reuse_count || 0) + 1;
    await supabase.from("asset_library").update({
      reuse_count: next,
      last_used_at: new Date().toISOString(),
    }).eq("id", asset_id);
  } catch {}
}

// ─── VISUAL ASSETS (per-story, generated/selected) (v3.8.0) ───

export async function listVisualAssets(story_id) {
  const { data, error } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("story_id", story_id)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

export async function insertVisualAsset(asset) {
  const { data, error } = await supabase
    .from("visual_assets")
    .insert(asset)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVisualAssetSelection(asset_id, was_selected, selection_order = null) {
  const { error } = await supabase
    .from("visual_assets")
    .update({ was_selected, selection_order })
    .eq("id", asset_id);
  if (error) throw error;
}

// ─── AGENT FEEDBACK (v3.8.0) ───

export async function getAgentFeedback({ agent_name, brand_profile_id, limit = 5 }) {
  const { data } = await supabase
    .from("agent_feedback")
    .select("*")
    .eq("agent_name", agent_name)
    .eq("brand_profile_id", brand_profile_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Helper: get auth token ───
async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

// ═══════════════════════════════════════════════════════════
// CLAUDE API — unchanged from v3.7.0
// All view code goes through runPrompt() in src/lib/ai/runner.js.
// These exist as transport for the runner.
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

export async function callClaude(prompt, maxTokens = 1000, model = "sonnet") {
  const { text } = await callClaudeRaw(prompt, maxTokens, model);
  return text;
}

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
        const chunk = parsed?.delta?.text || "";
        if (chunk) {
          fullText += chunk;
          if (onChunk) onChunk(fullText);
        }
        if (parsed.type === "usage" && parsed.usage) {
          usage = parsed.usage;
          if (parsed.model) modelId = parsed.model;
        }
      } catch {}
    }
  }

  return { text: fullText, usage, model: modelId };
}

export async function callClaudeStream(prompt, maxTokens = 1000, onChunk) {
  const { text } = await callClaudeStreamRaw(prompt, maxTokens, onChunk);
  return text;
}

// ─── AUDIT LOG (user actions — unchanged) ───

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
  } catch {}
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

// ─── AIRTABLE SYNC ───

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
  } catch {}
}

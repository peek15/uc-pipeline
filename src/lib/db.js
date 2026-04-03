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

export async function callClaude(prompt, maxTokens = 1000) {
  const token = await getToken();
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API ${res.status}`);
  }
  const data = await res.json();
  return data.text;
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

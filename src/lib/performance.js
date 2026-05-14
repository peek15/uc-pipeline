import { supabase } from "@/lib/db";
import { normalizeTenant } from "@/lib/brand";

// Server-safe: accepts an optional svc (service-role client) for use in API routes.
// Falls back to the browser client when called client-side.
export async function logWorkflowOutcomeSnapshot({ svc, story, tenant, stage = "approved", actorId = null }) {
  if (!story?.id) return null;
  const row = performanceSnapshotFromStory(story, {}, tenant, "workflow_outcome");
  row.raw_source = {
    stage,
    actor_user_id: actorId || null,
    workflow_outcome: true,
    recorded_at: new Date().toISOString(),
  };
  try {
    const client = svc || supabase;
    const { data, error } = await client
      .from("performance_snapshots")
      .insert(row)
      .select("id")
      .single();
    if (error) { console.warn("[performance] logWorkflowOutcomeSnapshot:", error.message); return null; }
    return data?.id || null;
  } catch (e) {
    console.warn("[performance] logWorkflowOutcomeSnapshot:", e?.message);
    return null;
  }
}

function toInt(value) {
  if (value === "" || value == null) return null;
  const n = parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value) {
  if (value === "" || value == null) return null;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function performanceSnapshotFromStory(story, metrics = {}, tenant, source = "manual", rawSource = {}) {
  const t = normalizeTenant(tenant || story);
  return {
    workspace_id: story?.workspace_id || t.workspace_id,
    brand_profile_id: story?.brand_profile_id || t.brand_profile_id,
    story_id: story?.id || null,
    content_template_id: story?.content_template_id || null,
    content_type: story?.content_type || null,
    channel: story?.channel || story?.platform_target || null,
    platform: story?.platform_target || story?.channel || null,
    source,
    views: toInt(metrics.metrics_views),
    completion_rate: toNumber(metrics.metrics_completion),
    watch_time: toNumber(metrics.metrics_watch_time),
    likes: toInt(metrics.metrics_likes),
    comments: toInt(metrics.metrics_comments),
    saves: toInt(metrics.metrics_saves),
    shares: toInt(metrics.metrics_shares),
    follows: toInt(metrics.metrics_follows),
    raw_source: rawSource && typeof rawSource === "object" ? rawSource : {},
  };
}

export async function logPerformanceSnapshot({ story, metrics, tenant, source = "manual", rawSource = {} }) {
  const row = performanceSnapshotFromStory(story, metrics, tenant, source, rawSource);
  if (!row.story_id) return null;
  const hasMetric = ["views", "completion_rate", "watch_time", "likes", "comments", "saves", "shares", "follows"]
    .some(key => row[key] != null);
  if (!hasMetric) return null;
  const { data, error } = await supabase
    .from("performance_snapshots")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data?.id || null;
}

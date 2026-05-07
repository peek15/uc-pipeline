// ═══════════════════════════════════════════════════════════
// assetLibrary.js — CRUD for the asset_library table +
// Supabase Storage upload/delete.
//
// asset-library bucket is public — URLs are permanent and
// used directly by the asset-curator agent.
// ═══════════════════════════════════════════════════════════

import { supabase } from "./db";
import { DEFAULT_WORKSPACE_ID } from "@/lib/brand";

const BUCKET = "asset-library";

const ALLOWED_MIME = {
  "video/mp4":       "mp4",
  "video/quicktime": "mov",
  "video/webm":      "webm",
  "audio/mpeg":      "mp3",
  "audio/mp4":       "m4a",
  "audio/x-m4a":     "m4a",
  "audio/wav":       "wav",
  "image/jpeg":      "jpg",
  "image/png":       "png",
  "image/webp":      "webp",
};

export const ASSET_LIB_TYPES = [
  { key: "intro",        label: "Intro clip",     desc: "Opening sequence" },
  { key: "outro",        label: "Outro clip",     desc: "Closing sequence" },
  { key: "transition",   label: "Transition",     desc: "Between scenes" },
  { key: "broll",        label: "B-roll",         desc: "Atmospheric / licensed footage" },
  { key: "voice_locked", label: "Voice (locked)", desc: "Pre-recorded VO (closing line etc.)" },
];

export const POSITION_INTENT_OPTIONS = [
  { key: "opening", label: "Opening" },
  { key: "closing", label: "Closing" },
  { key: "any",     label: "Any position" },
];

/**
 * Upload a file to storage and insert a row into asset_library.
 *
 * @param {object} opts
 * @param {File}   opts.file
 * @param {string} opts.brandProfileId
 * @param {string} [opts.workspaceId]
 * @param {object} opts.meta — { name, type, tags, format_scope, era_scope, position_intent, language }
 * @returns {Promise<object>} — inserted asset_library row
 */
export async function uploadLibraryAsset({ file, brandProfileId, workspaceId = DEFAULT_WORKSPACE_ID, meta }) {
  if (!file) throw new Error("No file provided");
  if (!ALLOWED_MIME[file.type]) throw new Error(`File type not supported: ${file.type}`);
  if (file.size > 100 * 1024 * 1024) throw new Error("File too large — max 100 MB");

  const ext       = ALLOWED_MIME[file.type];
  const assetId   = crypto.randomUUID();
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${brandProfileId}/${assetId}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const file_url = urlData.publicUrl;

  const row = {
    brand_profile_id:  brandProfileId,
    workspace_id:      workspaceId,
    type:              meta.type              || "broll",
    name:              (meta.name || file.name).slice(0, 200),
    file_url,
    file_type:         file.type,
    language:          meta.language          || null,
    format_scope:      meta.format_scope      || [],
    era_scope:         meta.era_scope         || [],
    tags:              meta.tags              || [],
    position_intent:   meta.position_intent   || ["any"],
    source:            "manual_upload",
    created_by_agent:  false,
    active:            true,
    reuse_count:       0,
  };

  const { data, error: dbError } = await supabase
    .from("asset_library")
    .insert(row)
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`Database error: ${dbError.message}`);
  }

  return data;
}

/**
 * List all library assets for a brand, newest first.
 */
export async function listLibraryAssets(brandProfileId, workspaceId = DEFAULT_WORKSPACE_ID) {
  let query = supabase
    .from("asset_library")
    .select("*")
    .eq("brand_profile_id", brandProfileId)
    .order("created_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Toggle active/inactive (soft-delete for the curator).
 */
export async function setAssetActive(id, active) {
  const { error } = await supabase
    .from("asset_library")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Hard delete — removes storage file and DB row.
 */
export async function deleteLibraryAsset(id) {
  const { data: row, error: fetchErr } = await supabase
    .from("asset_library")
    .select("file_url, brand_profile_id")
    .eq("id", id)
    .single();
  if (fetchErr) throw new Error("Asset not found");

  // Derive storage path from public URL
  const storageKey = row.file_url.split(`/${BUCKET}/`)[1];
  if (storageKey) {
    await supabase.storage.from(BUCKET).remove([storageKey]).catch(() => {});
  }

  const { error: dbErr } = await supabase.from("asset_library").delete().eq("id", id);
  if (dbErr) throw new Error(dbErr.message);
}

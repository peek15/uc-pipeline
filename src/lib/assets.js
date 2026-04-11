// ═══════════════════════════════════════════════════════════
// ASSET MANAGER — Secure file storage for brand context
// Security principles:
//   - All files stored with RLS in Supabase Storage
//   - No public URLs ever — signed URLs with 1h expiry only
//   - AI never receives raw URLs — text summaries only
//   - Every access logged to audit_log
//   - Files organized by workspace_id/brand_profile_id
// ═══════════════════════════════════════════════════════════

import { supabase } from "./db";

const BUCKET = "brand-assets";
const SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed file types for brand context
const ALLOWED_TYPES = {
  "application/pdf":                    "pdf",
  "text/plain":                         "txt",
  "text/markdown":                      "md",
  "application/msword":                 "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// Asset types for UI
export const ASSET_TYPES = [
  { key:"brand_guide",        label:"Brand guide",        desc:"Voice, tone, visual identity" },
  { key:"reference_script",   label:"Reference script",   desc:"Example content in your voice" },
  { key:"audience_research",  label:"Audience research",  desc:"Who your audience is" },
  { key:"visual_reference",   label:"Visual reference",   desc:"Style and aesthetic references" },
  { key:"content_brief",      label:"Content brief",      desc:"Brief for a specific campaign" },
  { key:"other",              label:"Other",              desc:"Any other brand context" },
];

// ── Upload asset securely ──
export async function uploadAsset({ file, brandProfileId, workspaceId, assetType, displayName }) {
  if (!file) throw new Error("No file provided");
  if (file.size > MAX_FILE_SIZE) throw new Error(`File too large — max 10MB`);
  if (!ALLOWED_TYPES[file.type]) throw new Error(`File type not allowed: ${file.type}`);

  const ext      = ALLOWED_TYPES[file.type];
  const assetId  = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Path: workspace/brand/assetId_filename — never user-controlled path segments
  const storagePath = `${workspaceId}/${brandProfileId}/${assetId}_${safeName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false, // never overwrite
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Store reference in story_documents (brand-level, no story_id)
  const { data: doc, error: dbError } = await supabase
    .from("story_documents")
    .insert({
      brand_profile_id: brandProfileId,
      workspace_id:     workspaceId,
      document_type:    assetType || "other",
      file_name:        displayName || file.name,
      storage_ref:      storagePath, // path only, never URL
      content_summary:  null, // populated after AI extraction
    })
    .select()
    .single();

  if (dbError) {
    // Clean up storage if DB insert fails
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Database error: ${dbError.message}`);
  }

  return doc;
}

// ── Get signed URL (short-lived, never stored) ──
export async function getSignedUrl(storagePath) {
  if (!storagePath) throw new Error("No storage path provided");

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

  if (error) throw new Error(`Could not generate access URL: ${error.message}`);

  // Log access (audit trail)
  await supabase.from("audit_log").insert({
    action:      "asset_accessed",
    entity_type: "brand_asset",
    entity_id:   null,
    performed_by:"system",
  }).then(() => {}); // non-blocking

  return data.signedUrl; // expires in 1h, never stored
}

// ── Extract text from file for AI context ──
export async function extractTextFromFile(file) {
  const type = ALLOWED_TYPES[file.type];
  if (!type) return null;

  if (type === "txt" || type === "md") {
    return await file.text();
  }

  if (type === "pdf") {
    // Extract via PDF.js or send to server-side extraction
    // For now return null — implement server-side later
    return null;
  }

  return null;
}

// ── List assets for a brand profile ──
export async function listAssets(brandProfileId) {
  const { data, error } = await supabase
    .from("story_documents")
    .select("*")
    .eq("brand_profile_id", brandProfileId)
    .is("story_id", null) // brand-level assets only (no story_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// ── Delete asset securely ──
export async function deleteAsset(assetId, brandProfileId) {
  // Get the record first to get storage path
  const { data: doc, error: fetchError } = await supabase
    .from("story_documents")
    .select("storage_ref, brand_profile_id")
    .eq("id", assetId)
    .single();

  if (fetchError) throw new Error("Asset not found");

  // Verify ownership
  if (doc.brand_profile_id !== brandProfileId) {
    throw new Error("Access denied — asset does not belong to this brand");
  }

  // Delete from storage first
  if (doc.storage_ref) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([doc.storage_ref]);
    if (storageError) console.warn("Storage deletion failed:", storageError.message);
  }

  // Delete DB record
  const { error: dbError } = await supabase
    .from("story_documents")
    .delete()
    .eq("id", assetId);

  if (dbError) throw new Error(`Database deletion failed: ${dbError.message}`);
}

// ── Update asset summary (after AI extraction) ──
export async function updateAssetSummary(assetId, summary) {
  await supabase
    .from("story_documents")
    .update({ content_summary: summary })
    .eq("id", assetId);
}

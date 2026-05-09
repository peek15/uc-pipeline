// /api/workspace-members — list, add, and remove workspace members.
// All mutations require the caller to be an owner or admin of the workspace.
// Secrets never leave the server; service role is used for member writes.

import { getAuthenticatedUser, makeServiceClient } from "@/lib/apiAuth";

function serviceClient() {
  return makeServiceClient();
}

async function authenticate(request) {
  return getAuthenticatedUser(request);
}

async function callerRole(svc, workspaceId, user) {
  const { data } = await svc
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
    .maybeSingle();
  return data?.role || null;
}

function ok(payload) { return Response.json(payload); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

// GET /api/workspace-members?workspace_id=...
export async function GET(request) {
  const user = await authenticate(request);
  if (!user) return err("Unauthorized", 401);

  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) return err("Missing workspace_id");

  const svc = serviceClient();

  // Caller must be a member (or it's the default workspace)
  const role = await callerRole(svc, workspaceId, user);
  const isDefault = workspaceId === "00000000-0000-0000-0000-000000000001";
  if (!role && !isDefault) return err("Not a member of this workspace", 403);

  const { data, error } = await svc
    .from("workspace_members")
    .select("id, email, role, created_at, user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) return err(error.message, 500);
  return ok({ members: data || [] });
}

// POST /api/workspace-members — add a member
// Body: { workspace_id, email, role }
export async function POST(request) {
  const user = await authenticate(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { workspace_id, email, role = "member" } = body || {};
  if (!workspace_id) return err("Missing workspace_id");
  if (!email || !email.includes("@")) return err("Invalid email");

  const VALID_ROLES = ["owner", "admin", "editor", "member", "viewer"];
  if (!VALID_ROLES.includes(role)) return err(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);

  const svc = serviceClient();
  const isDefault = workspace_id === "00000000-0000-0000-0000-000000000001";

  // For non-default workspaces, require owner/admin
  if (!isDefault) {
    const callerR = await callerRole(svc, workspace_id, user);
    if (!["owner", "admin"].includes(callerR)) {
      return err("Only workspace owners and admins can add members", 403);
    }
  }

  // Prevent duplicate
  const { data: existing } = await svc
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspace_id)
    .ilike("email", email)
    .maybeSingle();
  if (existing) return err("This email is already a member of the workspace");

  const { data, error } = await svc
    .from("workspace_members")
    .insert({ workspace_id, email: email.toLowerCase().trim(), role })
    .select("id, email, role, created_at")
    .single();

  if (error) return err(error.message, 500);
  return ok({ member: data });
}

// DELETE /api/workspace-members — remove a member
// Body: { workspace_id, member_id }
export async function DELETE(request) {
  const user = await authenticate(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { workspace_id, member_id } = body || {};
  if (!workspace_id || !member_id) return err("Missing workspace_id or member_id");

  const svc = serviceClient();

  // Require owner/admin
  const callerR = await callerRole(svc, workspace_id, user);
  if (!["owner", "admin"].includes(callerR)) {
    return err("Only workspace owners and admins can remove members", 403);
  }

  // Prevent removing the last owner
  const { data: target } = await svc
    .from("workspace_members")
    .select("role")
    .eq("id", member_id)
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  if (!target) return err("Member not found");

  if (target.role === "owner") {
    const { count } = await svc
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("role", "owner");
    if (count <= 1) return err("Cannot remove the last owner of a workspace");
  }

  const { error } = await svc
    .from("workspace_members")
    .delete()
    .eq("id", member_id)
    .eq("workspace_id", workspace_id);

  if (error) return err(error.message, 500);
  return ok({ ok: true });
}

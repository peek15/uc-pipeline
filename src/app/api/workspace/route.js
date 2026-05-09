// POST /api/workspace — create a new workspace and seed the caller as owner.
// Uses service role so the insert bypasses the workspaces INSERT policy (not yet set
// for client-side use). The caller must be authenticated.

import { getAuthenticatedUser, makeServiceClient } from "@/lib/apiAuth";

function ok(payload) { return Response.json(payload); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { name } = body || {};
  if (!name?.trim()) return err("Missing workspace name");

  const svc = makeServiceClient();
  const id = crypto.randomUUID();

  const { data: workspace, error: wErr } = await svc
    .from("workspaces")
    .insert({ id, name: name.trim(), owner_user_id: user.id })
    .select("id, name")
    .single();
  if (wErr) return err(wErr.message, 500);

  const { error: mErr } = await svc
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: user.id, email: user.email.toLowerCase().trim(), role: "owner" });

  if (mErr) {
    await svc.from("workspaces").delete().eq("id", id);
    return err(mErr.message, 500);
  }

  return ok({ workspace });
}

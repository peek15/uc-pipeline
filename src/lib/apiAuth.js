import { createClient } from "@supabase/supabase-js";

export function makeServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedUser(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function getWorkspaceMemberRole(svc, userId, email, workspaceId) {
  const { data } = await svc
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .or(`user_id.eq.${userId},email.ilike.${email}`)
    .maybeSingle();
  return data?.role || null;
}

// Returns { role } on success, { error, status } on failure.
export async function requireWorkspaceMember(svc, user, workspaceId, allowedRoles) {
  const role = await getWorkspaceMemberRole(svc, user.id, user.email, workspaceId);
  if (!role) return { error: "Not a member of this workspace", status: 403 };
  if (allowedRoles && !allowedRoles.includes(role)) {
    return { error: `Requires one of: ${allowedRoles.join(", ")}`, status: 403 };
  }
  return { role };
}

export async function requireWorkspaceOwnerOrAdmin(svc, user, workspaceId) {
  return requireWorkspaceMember(svc, user, workspaceId, ["owner", "admin"]);
}

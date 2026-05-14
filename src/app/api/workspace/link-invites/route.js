import { getAuthenticatedUser, makeServiceClient } from "@/lib/apiAuth";

function ok(payload) { return Response.json(payload); }
function err(msg, status = 400) { return Response.json({ error: msg }, { status }); }

// POST — sets user_id on any workspace_members rows pre-invited by email that are still unlinked.
// Safe to call every sign-in; updates nothing if already linked.
export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err("Unauthorized", 401);

  const svc = makeServiceClient();
  const { error } = await svc
    .from("workspace_members")
    .update({ user_id: user.id })
    .ilike("email", user.email)
    .is("user_id", null);

  if (error) return err(error.message, 500);
  return ok({ ok: true });
}

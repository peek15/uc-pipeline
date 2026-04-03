import { supabase } from "./db";

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "peekmedia.cc";

export function isEmailAllowed(email) {
  if (!email) return false;
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: typeof window !== "undefined" ? window.location.origin : "",
      queryParams: {
        hd: ALLOWED_DOMAIN,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

import "server-only";
import { forbidden, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Platform pages: signed in and listed in platform_admins (RLS shows a user
// only their own row). The api.platform_* functions check again.
export async function requirePlatformAdmin(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");
  if (data?.claims.is_anonymous) forbidden();
  const { data: row } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) forbidden();
  return userId;
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type CreateCafeState = { error: "invalid" | "slug_taken" | "failed" | null };

const input = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/),
});

// A signed-in person creates their café and becomes its owner (api.create_restaurant).
export async function createCafe(_prev: CreateCafeState, form: FormData): Promise<CreateCafeState> {
  const parsed = input.safeParse({ name: form.get("name"), slug: form.get("slug") });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims || claims.claims.is_anonymous) redirect("/login");
  const meta = claims.claims.user_metadata as { display_name?: string } | undefined;
  const displayName = meta?.display_name?.trim() || String(claims.claims.email ?? "").split("@")[0] || "Owner";

  const { error } = await supabase.schema("api").rpc("create_restaurant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_location_name: parsed.data.name,
    p_display_name: displayName,
  });
  if (error) return { error: error.code === "23505" ? "slug_taken" : "failed" };
  redirect("/admin");
}

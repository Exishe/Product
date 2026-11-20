"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

const input = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  isTest: z.boolean(),
});

export type TestFlagResult = { ok: true; orders: number } | { ok: false };

// Flags (or un-flags) the orders of a range of business days as test data. The
// dashboard, metrics and export leave flagged orders out; Postgres checks the role.
export async function setOrdersTest(raw: z.infer<typeof input>): Promise<TestFlagResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return { ok: false };
  const { data, error } = await supabase.schema("api").rpc("set_orders_test", {
    p_location_id: location.id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_is_test: parsed.data.isTest,
  });
  if (error || data === null) return { ok: false };
  revalidatePath("/admin/dashboard");
  return { ok: true, orders: data };
}

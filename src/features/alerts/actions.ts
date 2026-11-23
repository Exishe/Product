"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { CALLS_RANGE, OVERDUE_RANGE } from "./model";

// One database call; who may do it is enforced in Postgres (api.set_alert_settings).
export async function saveAlertSettings(overdueMinutes: number, repeatCalls: number): Promise<boolean> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = z
    .object({
      minutes: z.number().int().min(OVERDUE_RANGE.min).max(OVERDUE_RANGE.max),
      calls: z.number().int().min(CALLS_RANGE.min).max(CALLS_RANGE.max),
    })
    .safeParse({ minutes: overdueMinutes, calls: repeatCalls });
  if (!parsed.success) return false;
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return false;
  const { error } = await (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
    .schema("api")
    .rpc("set_alert_settings", {
      p_location_id: location.id,
      p_overdue_minutes: parsed.data.minutes,
      p_repeat_calls: parsed.data.calls,
    });
  revalidatePath("/admin");
  return !error;
}

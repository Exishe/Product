"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { SOUND_IDS } from "@/lib/sounds/library";
import { createClient } from "@/lib/supabase/server";

// One database call; who may do it is enforced in Postgres (api.set_staff_sounds).
export async function saveStaffSounds(orderSound: string, callSound: string): Promise<boolean> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = z
    .object({ order: z.enum(SOUND_IDS), call: z.enum(SOUND_IDS) })
    .safeParse({ order: orderSound, call: callSound });
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
    .rpc("set_staff_sounds", {
      p_location_id: location.id,
      p_order_sound: parsed.data.order,
      p_call_sound: parsed.data.call,
    });
  revalidatePath("/admin");
  return !error;
}

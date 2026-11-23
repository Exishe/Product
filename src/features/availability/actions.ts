"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

// Each action checks the session and makes one database call; who may do it is
// enforced in Postgres (api.set_ordering_pause, api.set_kitchen_closed_today).
export type ControlResult = { ok: true; until: string | null } | { ok: false };

async function firstLocationId(restaurantId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** minutes: 1 to 720, or null for "until I resume". */
export async function pauseOrdering(minutes: number | null): Promise<ControlResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = z.number().int().min(1).max(720).nullable().safeParse(minutes);
  const location = await firstLocationId(me.restaurantId);
  if (!parsed.success || !location) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("set_ordering_pause", {
    p_location_id: location,
    p_paused: true,
    ...(parsed.data === null ? {} : { p_minutes: parsed.data }),
  });
  revalidatePath("/admin");
  return error ? { ok: false } : { ok: true, until: data ?? null };
}

export async function resumeOrdering(): Promise<ControlResult> {
  const me = await requireMember(["owner", "manager"]);
  const location = await firstLocationId(me.restaurantId);
  if (!location) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("api")
    .rpc("set_ordering_pause", { p_location_id: location, p_paused: false });
  revalidatePath("/admin");
  return error ? { ok: false } : { ok: true, until: null };
}

export async function setKitchenClosedToday(closed: boolean): Promise<ControlResult> {
  const me = await requireMember(["owner", "manager"]);
  const location = await firstLocationId(me.restaurantId);
  if (!location) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("set_kitchen_closed_today", { p_location_id: location, p_closed: closed });
  revalidatePath("/admin");
  return error ? { ok: false } : { ok: true, until: data ?? null };
}

// A section's hours: both ends "HH:MM", or both null for no limit.
export async function saveCategoryWindow(
  categoryId: string,
  from: string | null,
  to: string | null,
): Promise<boolean> {
  await requireMember(["owner", "manager"]);
  const time = z.string().regex(/^\d{2}:\d{2}$/);
  const parsed = z
    .object({ id: z.uuid(), from: time.nullable(), to: time.nullable() })
    .refine((v) => (v.from === null) === (v.to === null) && v.from !== v.to)
    .safeParse({ id: categoryId, from, to });
  if (!parsed.success) return false;
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("set_category_window", {
    p_category_id: parsed.data.id,
    p_from: parsed.data.from as string,
    p_to: parsed.data.to as string,
  });
  revalidatePath("/admin/menu");
  return !error;
}

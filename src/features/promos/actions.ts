"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { validWindow } from "./model";

// Each action checks the session and makes one database call; who may do it is
// enforced in Postgres (api.save_promo, api.set_promo_on, api.delete_promo).
export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: "limit" | "title" | "long" | "window" | "failed" };
export type SimpleResult = { ok: true; live?: boolean } | { ok: false };

const line = (max: number) => z.string().trim().max(max).optional();
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .nullable();
const input = z.object({
  id: z.uuid().nullable(),
  title: z.object({ hy: z.string().trim().min(1).max(80), ru: line(80), en: line(80) }),
  text: z.object({ hy: line(160), ru: line(160), en: line(160) }),
  badge: z.string().trim().max(16).nullable(),
  startsAt: localDate,
  endsAt: localDate,
});
export type PromoInput = z.input<typeof input>;

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

export async function savePromo(value: PromoInput): Promise<SaveResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = input.safeParse(value);
  if (!parsed.success) {
    const onTitle = parsed.error.issues.some((i) => i.path[0] === "title" && i.path[1] === "hy");
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
    return { ok: false, error: onTitle && !tooLong ? "title" : tooLong ? "long" : "failed" };
  }
  const v = parsed.data;
  if (!validWindow(v.startsAt, v.endsAt)) return { ok: false, error: "window" };
  const location = await firstLocationId(me.restaurantId);
  if (!location) return { ok: false, error: "failed" };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("save_promo", {
    p_location_id: location,
    p_promo_id: v.id as string,
    p_title: v.title,
    p_text: v.text,
    p_badge: v.badge || (null as unknown as string),
    p_starts: v.startsAt as string,
    p_ends: v.endsAt as string,
  });
  revalidatePath("/admin");
  if (error || !data) {
    const m = error?.message ?? "";
    return { ok: false, error: m.includes("promo_limit") ? "limit" : m.includes("too_long") ? "long" : "failed" };
  }
  return { ok: true, id: data };
}

export async function setPromoOn(id: string, on: boolean): Promise<SimpleResult> {
  await requireMember(["owner", "manager"]);
  const parsed = z.object({ id: z.uuid(), on: z.boolean() }).safeParse({ id, on });
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("set_promo_on", { p_promo_id: parsed.data.id, p_on: parsed.data.on });
  revalidatePath("/admin");
  return error ? { ok: false } : { ok: true, live: data === true };
}

export async function deletePromo(id: string): Promise<SimpleResult> {
  await requireMember(["owner", "manager"]);
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("delete_promo", { p_promo_id: parsed.data });
  revalidatePath("/admin");
  return error ? { ok: false } : { ok: true };
}

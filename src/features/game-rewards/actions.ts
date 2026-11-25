"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { GAME_IDS, LEVEL_RANGE, PERCENT_RANGE, TEXT_MAX } from "./model";

const line = z.string().trim().max(TEXT_MAX).optional();
const schema = z.object({
  on: z.boolean(),
  kind: z.enum(["percent", "text"]),
  level: z.number().int().min(LEVEL_RANGE.min).max(LEVEL_RANGE.max),
  percent: z.number().int().min(PERCENT_RANGE.min).max(PERCENT_RANGE.max).nullable(),
  text: z.object({ hy: line, ru: line, en: line }),
  game: z.enum(GAME_IDS).nullable(),
});

// One database call; who may do it, and the limits, are enforced in Postgres
// (api.set_game_rewards, owner or manager of the location).
export async function saveGameRewards(input: unknown): Promise<boolean> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return false;
  const s = parsed.data;
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return false;
  const { error } = await (supabase as unknown as SupabaseClient).schema("api").rpc("set_game_rewards", {
    p_location_id: location.id,
    p_on: s.on,
    p_kind: s.kind,
    p_level: s.level,
    p_percent: s.kind === "percent" ? s.percent : null,
    p_text: s.kind === "text" ? s.text : {},
    p_game: s.game,
  });
  revalidatePath("/admin");
  return !error;
}

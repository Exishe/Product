"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { loadFloor } from "./load.server";
import { tableInput, type TableInput } from "./schema";

export type TableResult = { ok: true; id: string } | { ok: false; error: "invalid" | "label_taken" | "failed" };

const UNIQUE_VIOLATION = "23505";

// Tables are plain rows: owners and managers write them directly and RLS
// checks the location (tables_admin_write). Postgres keeps labels unique.
export async function addTable(input: TableInput): Promise<TableResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = tableInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const floor = await loadFloor(me.restaurantId);
  if (!floor) return { ok: false, error: "failed" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .insert({
      restaurant_id: me.restaurantId,
      location_id: floor.locationId,
      label: parsed.data.label,
      seats: parsed.data.seats,
      area_id: parsed.data.areaId,
      sort: floor.tables.length + 1,
    })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "label_taken" };
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/tables");
  return { ok: true, id: data.id };
}

export async function updateTable(id: string, input: TableInput): Promise<TableResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = tableInput.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .update({ label: parsed.data.label, seats: parsed.data.seats, area_id: parsed.data.areaId })
    .eq("id", id)
    .eq("restaurant_id", me.restaurantId)
    .select("id")
    .maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "label_taken" };
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/tables");
  return { ok: true, id: data.id };
}

// "Reprint QR": a new qr_version makes every printed sticker of this table
// (and every guest session opened with it) stop working at once. The update
// only applies to the version we read, so two clicks bump it once each.
export async function reprintTable(id: string): Promise<TableResult> {
  const me = await requireMember(["owner", "manager"]);
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data: table } = await supabase
    .from("tables")
    .select("qr_version")
    .eq("id", id)
    .eq("restaurant_id", me.restaurantId)
    .maybeSingle();
  if (!table) return { ok: false, error: "failed" };
  const { data, error } = await supabase
    .from("tables")
    .update({ qr_version: table.qr_version + 1 })
    .eq("id", id)
    .eq("qr_version", table.qr_version)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/tables");
  return { ok: true, id: data.id };
}

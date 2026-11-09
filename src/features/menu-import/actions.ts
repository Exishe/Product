"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishMenu } from "@/features/menu/actions";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { getReader } from "./get-reader.server";
import { normalizeDraft } from "./normalize";
import { ReadError, type ImageInput, type ReadErrorCode } from "./reader";
import { menuDraft, type MenuDraft } from "./schema";

// The photo import, step by step. Photos go from the browser straight to
// Storage (RLS checks the café folder); these actions register them, have them
// read, keep the owner's edits and apply the result. The database functions
// check the caller's role again.

const importId = z.uuid();
const MAX_PAGES = 8;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type StartResult = { ok: true; importId: string; folder: string } | { ok: false };
export type ReadResultState = { ok: true } | { ok: false; error: ReadErrorCode | "upload" };
export type ApplyResult =
  | { ok: true; dishes: number; published: boolean }
  | { ok: false; error: "price_required" | "name_required" | "closed" | "failed" };

export async function startImport(): Promise<StartResult> {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("start_menu_import", { p_restaurant_id: me.restaurantId });
  if (error || !data) return { ok: false };
  return { ok: true, importId: data, folder: `${me.restaurantId}/${data}` };
}

export async function readImport(id: string, paths: string[]): Promise<ReadResultState> {
  await requireMember(["owner", "manager"]);
  const parsed = z
    .object({ id: importId, paths: z.array(z.string().max(200)).min(1).max(MAX_PAGES) })
    .safeParse({ id, paths });
  if (!parsed.success) return { ok: false, error: "upload" };
  const supabase = await createClient();
  const api = supabase.schema("api");

  // The function checks every path sits in this import's own folder.
  const registered = await api.rpc("add_menu_import_images", { p_import_id: id, p_paths: paths });
  if (registered.error) return { ok: false, error: "upload" };

  try {
    const images: ImageInput[] = [];
    for (const path of paths) {
      const { data, error } = await supabase.storage.from("menu-imports").download(path);
      if (error || !data || !MIME.has(data.type))
        throw new ReadError("unreadable", "photo not readable from storage");
      images.push({
        mimeType: data.type as ImageInput["mimeType"],
        data: Buffer.from(await data.arrayBuffer()).toString("base64"),
      });
    }
    const result = await getReader().read(images);
    const saved = await api.rpc("save_menu_import_draft", {
      p_import_id: id,
      p_draft: normalizeDraft(result.menu),
      p_model: result.model,
      p_input_tokens: result.inputTokens ?? undefined,
      p_output_tokens: result.outputTokens ?? undefined,
    });
    if (saved.error) throw new ReadError("provider_unavailable", saved.error.message);
    return { ok: true };
  } catch (error) {
    const code: ReadErrorCode = error instanceof ReadError ? error.code : "provider_unavailable";
    console.error("menu import failed", {
      importId: id,
      code,
      detail: error instanceof Error ? error.message : error,
    });
    await api.rpc("fail_menu_import", { p_import_id: id, p_error: code });
    return { ok: false, error: code };
  } finally {
    revalidatePath(`/admin/menu/import/${id}`);
  }
}

export async function saveDraft(id: string, draft: MenuDraft): Promise<boolean> {
  await requireMember(["owner", "manager"]);
  const parsed = z.object({ id: importId, draft: menuDraft }).safeParse({ id, draft });
  if (!parsed.success) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .schema("api")
    .rpc("save_menu_import_draft", { p_import_id: id, p_draft: parsed.data.draft });
  return !error;
}

function applyError(message: string): Extract<ApplyResult, { ok: false }>["error"] {
  if (message.includes("price_required")) return "price_required";
  if (message.includes("name_required")) return "name_required";
  if (message.includes("import_closed")) return "closed";
  return "failed";
}

// Adds the reviewed draft to the menu. With `publish`, the menu goes live too;
// the database refuses that while any AI name is unchecked.
export async function applyImport(id: string, draft: MenuDraft, publish: boolean): Promise<ApplyResult> {
  await requireMember(["owner", "manager"]);
  const parsed = z.object({ id: importId, draft: menuDraft }).safeParse({ id, draft });
  if (!parsed.success) return { ok: false, error: "failed" };
  const supabase = await createClient();
  const api = supabase.schema("api");
  const saved = await api.rpc("save_menu_import_draft", { p_import_id: id, p_draft: parsed.data.draft });
  if (saved.error) return { ok: false, error: applyError(saved.error.message) };
  const applied = await api.rpc("apply_menu_import", { p_import_id: id });
  if (applied.error) return { ok: false, error: applyError(applied.error.message) };
  revalidatePath("/admin/menu");

  const published = publish ? (await publishMenu()).ok : false;
  return { ok: true, dishes: applied.data ?? 0, published };
}

export async function discardImport(id: string): Promise<boolean> {
  await requireMember(["owner", "manager"]);
  if (!importId.safeParse(id).success) return false;
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("discard_menu_import", { p_import_id: id });
  return !error;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { menuDraft, type MenuDraft } from "./schema";

export type ImportStatus = "uploaded" | "processing" | "needs_review" | "applied" | "failed" | "discarded";

export type ImportView = {
  id: string;
  status: ImportStatus;
  error: string | null;
  draft: MenuDraft | null;
  photos: { page: number; url: string }[];
};

// One import of the owner's café, read with their session (RLS applies), with
// short-lived links to its photos in the private bucket.
export async function loadImport(id: string, restaurantId: string): Promise<ImportView | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("menu_imports")
    .select("id, status, error, draft, menu_import_images(storage_path, page)")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) return null;

  const pages = [...data.menu_import_images].sort((a, b) => a.page - b.page);
  const signed = pages.length
    ? (
        await supabase.storage.from("menu-imports").createSignedUrls(
          pages.map((p) => p.storage_path),
          3600,
        )
      ).data
    : [];
  const draft = menuDraft.safeParse(data.draft);

  return {
    id: data.id,
    status: data.status as ImportStatus,
    error: data.error,
    draft: draft.success ? draft.data : null,
    photos: pages.flatMap((p, i) =>
      signed?.[i]?.signedUrl ? [{ page: p.page, url: signed[i].signedUrl }] : [],
    ),
  };
}

"use client";

import { clsx } from "clsx";
import { Image as ImageIcon, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "@/features/admin-ui/toast";
import { sectionTitle, textAction } from "@/features/admin-ui/styles";
import { resizeToWebp } from "@/features/menu/photo";
import { getBrowserClient } from "@/lib/supabase/browser";
import { saveSectionCover } from "./actions";

// Upload file names are timestamps (the cover check wants digits).
const stamp = () => Date.now();

export type CoverSection = { id: string; name: string | null; cover: string | null };

const coverUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;

// «Բաժինների շապիկներ» (ADR-058): a wide photo per menu section. Each one is
// saved as soon as it is uploaded or removed; guests read covers live.
export function SectionCovers({
  restaurantId,
  ready,
  sections,
}: {
  restaurantId: string;
  ready: boolean;
  sections: CoverSection[];
}) {
  const b = useTranslations("look.brand");
  const t = useTranslations("look");
  const toast = useToast();
  const [rows, setRows] = useState(sections);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function set(id: string, path: string | null) {
    const result = await saveSectionCover(id, path);
    if (!result.ok) throw new Error("save failed");
    setRows((r) => r.map((s) => (s.id === id ? { ...s, cover: path } : s)));
    toast(b("coverSaved"));
  }

  async function pick(id: string, file: File | undefined) {
    if (!file) return;
    setBusy(id);
    setFailed(null);
    try {
      const blob = await resizeToWebp(file, 1200, 0.82);
      const path = `${restaurantId}/covers/${id}/${stamp()}.webp`;
      const { error } = await getBrowserClient()
        .storage.from("menu-images")
        .upload(path, blob, { contentType: "image/webp" });
      if (error) throw error;
      await set(id, path);
    } catch {
      setFailed(id);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setFailed(null);
    try {
      await set(id, null);
    } catch {
      setFailed(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    // Image slots straight on the page (ADR-093): no card around each section.
    <section className="flex flex-col gap-4" aria-labelledby="covers-title">
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="covers-title" className={sectionTitle}>
          {b("covers")}
        </h2>
        <p className="text-staff-label2 m-0 text-label">{b("coversHint")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-staff-label2 m-0">{b("coversEmpty")}</p>
      ) : (
        // One hairline row per section (ADR-093): a small 16:9 thumbnail or an
        // empty slot, the name, and the action at the right. The large preview
        // shows only for a cover that exists, so an empty menu is not a wall
        // of grey placeholders.
        <ul className="m-0 flex list-none flex-col p-0" data-testid="section-covers">
          {rows.map((s) => {
            const name = s.name ?? b("untitled");
            return (
              <li key={s.id} className="border-staff-sep flex min-w-0 flex-col gap-3 border-b py-3 first:pt-0 last:border-0">
                <div className="flex min-h-12 min-w-0 items-center gap-3">
                  {s.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
                    <img
                      src={coverUrl(s.cover)}
                      alt=""
                      width={64}
                      height={36}
                      loading="lazy"
                      className="bg-staff-fill block h-9 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="text-staff-label2 grid h-9 w-16 shrink-0 place-items-center rounded-md border border-dashed border-staff-field"
                    >
                      <ImageIcon className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 text-name font-semibold [overflow-wrap:anywhere]">{name}</span>
                  <span className="-mr-2 flex shrink-0 items-center">
                    <label
                      className={textAction(
                        "ink",
                        clsx(
                        "has-[:focus-visible]:outline-ink has-[:focus-visible]:underline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
                        busy !== s.id && "max-sm:w-11 max-sm:justify-center max-sm:px-0",
                        ),
                      )}
                    >
                      {/* On a phone the name keeps the width: the action is a
                          44 px icon, named by its file input. */}
                      <ImagePlus aria-hidden="true" className="max-sm:!size-5" />
                      <span className={busy === s.id ? undefined : "max-sm:sr-only"} aria-hidden="true">
                        {busy === s.id ? t("uploading") : s.cover ? b("coverChange") : b("coverChoose")}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={!ready || busy !== null}
                        aria-label={`${s.cover ? b("coverChange") : b("coverChoose")}: ${name}`}
                        onChange={(e) => void pick(s.id, e.target.files?.[0])}
                      />
                    </label>
                    {s.cover && (
                      <button
                        type="button"
                        disabled={!ready || busy !== null}
                        onClick={() => void remove(s.id)}
                        className={textAction("danger", "w-11 justify-center px-0")}
                        aria-label={b("coverRemove", { section: name })}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </div>
                {s.cover && (
                  // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
                  <img
                    src={coverUrl(s.cover)}
                    alt=""
                    width={1200}
                    height={514}
                    loading="lazy"
                    className="bg-staff-fill block aspect-video h-auto w-full max-w-md rounded-xl object-cover sm:ml-[4.75rem]"
                  />
                )}
                {failed === s.id && (
                  <p role="alert" className="text-pomegranate m-0 text-label font-semibold sm:ml-[4.75rem]">
                    {t("uploadFailed")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "@/features/admin-ui/toast";
import { button } from "@/features/admin-ui/styles";
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
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5" aria-labelledby="covers-title">
      <h2 id="covers-title" className="m-0 text-[1.25rem] font-bold">
        {b("covers")}
      </h2>
      <p className="text-staff-label2 m-0">{b("coversHint")}</p>
      {rows.length === 0 ? (
        <p className="text-staff-label2 m-0">{b("coversEmpty")}</p>
      ) : (
        <ul
          className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="section-covers"
        >
          {rows.map((s) => {
            const name = s.name ?? b("untitled");
            return (
              <li key={s.id} className="bg-staff-bg flex flex-col gap-3 rounded-2xl p-3">
                {s.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
                  <img
                    src={coverUrl(s.cover)}
                    alt=""
                    width={1200}
                    height={514}
                    loading="lazy"
                    className="bg-staff-fill block aspect-[21/9] h-auto w-full rounded-xl object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="border-staff-field block aspect-[21/9] w-full rounded-xl border border-dashed"
                  />
                )}
                <span className="text-[1.0625rem] font-semibold [overflow-wrap:anywhere]">{name}</span>
                <span className="flex flex-wrap gap-2">
                  <label
                    className={button(
                      "tinted",
                      "has-[:focus-visible]:outline-ink min-h-11 cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
                    )}
                  >
                    <ImagePlus aria-hidden="true" />
                    {busy === s.id ? t("uploading") : s.cover ? b("coverChange") : b("coverChoose")}
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
                      className={button("danger", "min-h-11")}
                      aria-label={b("coverRemove", { section: name })}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                </span>
                {failed === s.id && (
                  <p role="alert" className="text-pomegranate m-0 text-[0.9375rem] font-semibold">
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

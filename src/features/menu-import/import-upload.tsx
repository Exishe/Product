"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { resizeMenuPhoto } from "@/features/menu/photo";
import { getBrowserClient } from "@/lib/supabase/browser";
import { readImport, startImport } from "./actions";
import { ImportSteps } from "./steps";

const MAX_PAGES = 8;

type Phase = "idle" | "uploading" | "reading" | "failed";

// Step 1 and 2: choose the photos, upload them resized, have them read.
export function ImportUpload() {
  const t = useTranslations("menuImport");
  const router = useRouter();
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.preview)), [files]);

  function add(list: FileList | null) {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    setFiles((current) =>
      [...current, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(
        0,
        MAX_PAGES,
      ),
    );
    setPhase("idle");
  }

  function remove(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function run() {
    setPhase("uploading");
    try {
      const start = await startImport();
      if (!start.ok) throw new Error("start failed");
      const storage = getBrowserClient().storage.from("menu-imports");
      const paths: string[] = [];
      for (const [i, { file }] of files.entries()) {
        const path = `${start.folder}/${i + 1}.jpg`;
        const { error } = await storage.upload(path, await resizeMenuPhoto(file), {
          contentType: "image/jpeg",
        });
        if (error) throw error;
        paths.push(path);
      }
      setPhase("reading");
      // Success or not, the import page shows the result and what to do next.
      await readImport(start.importId, paths);
      router.push(`/admin/menu/import/${start.importId}`);
    } catch {
      setPhase("failed");
    }
  }

  const busy = phase === "uploading" || phase === "reading";

  return (
    <div className="flex flex-col gap-8">
      <ImportSteps current={busy && phase === "reading" ? "reading" : "photo"} />
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-lg">{t("intro")}</p>
        <p className="text-muted text-sm">{t("privacy")}</p>
      </div>

      {!busy && (
        <label className="rounded-sheet border-line-strong hover:border-tarragon focus-within:ring-tarragon flex cursor-pointer flex-col items-start gap-2 border-2 border-dashed bg-white p-6 focus-within:ring-2 focus-within:ring-offset-2 sm:p-8">
          <span className="display-face text-2xl">{t("choosePhotos")}</span>
          <span className="text-muted">{t("choosePhotosHint")}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            className="sr-only"
            data-testid="menu-photos"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {files.length > 0 && (
        <section aria-live="polite" className="flex flex-col gap-4">
          <p className="font-semibold">{t("chosen", { count: files.length })}</p>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {files.map((f, i) => (
              <li key={f.preview} className="flex flex-col gap-2">
                <div className="rounded-chip border-line relative overflow-hidden border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the owner's own photo */}
                  <img
                    src={f.preview}
                    alt={t("page", { page: i + 1 })}
                    className="aspect-[3/4] w-full object-cover"
                  />
                  {phase === "reading" && <span aria-hidden="true" className="import-scan" />}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{t("page", { page: i + 1 })}</span>
                  {!busy && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={t("removePage", { page: i + 1 })}
                      className="text-pomegranate hover:bg-pom-tint min-h-10 rounded-full px-3"
                    >
                      {t("remove")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={run}
          disabled={files.length === 0 || busy}
          className="rounded-input bg-tarragon h-12 px-6 font-semibold text-white disabled:opacity-50"
        >
          {t("read")}
        </button>
        <p role="status" className="text-muted">
          {phase === "uploading" ? t("uploading") : phase === "reading" ? t("reading") : ""}
        </p>
      </div>
      {phase === "failed" && (
        <div
          role="alert"
          className="rounded-chip bg-pom-tint text-pomegranate flex flex-wrap items-center gap-3 px-4 py-3"
        >
          <p className="flex-1">{t("errors.upload")}</p>
          <Link href="/admin/menu" className="underline">
            {t("fillByHand")}
          </Link>
        </div>
      )}
    </div>
  );
}

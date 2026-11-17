"use client";

import { Camera, CircleAlert, ScanText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { button } from "@/features/admin-ui/styles";
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
    <div className="flex flex-col gap-6">
      <ImportSteps current={busy && phase === "reading" ? "reading" : "photo"} />
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="m-0 text-[1.0625rem]">{t("intro")}</p>
        <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("privacy")}</p>
      </div>

      {!busy && (
        <label className="border-staff-field focus-within:outline-tarragon hover:border-tarragon flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white p-6 text-center focus-within:outline-3 focus-within:outline-offset-2 sm:p-10">
          <span
            aria-hidden="true"
            className="bg-tarragon-tint text-tarragon grid size-14 place-items-center rounded-2xl"
          >
            <Camera className="size-7" />
          </span>
          <span className="text-[1.25rem] font-bold">{t("choosePhotos")}</span>
          <span className="text-staff-label2 max-w-md">{t("choosePhotosHint")}</span>
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
          <p className="m-0 font-semibold">{t("chosen", { count: files.length })}</p>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4 lg:grid-cols-6">
            {files.map((f, i) => (
              <li key={f.preview} className="flex flex-col gap-2">
                <div className="ring-staff-sep relative overflow-hidden rounded-xl bg-white ring-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the owner's own photo */}
                  <img
                    src={f.preview}
                    alt={t("page", { page: i + 1 })}
                    className="aspect-[3/4] w-full object-cover"
                  />
                  {phase === "reading" && <span aria-hidden="true" className="import-scan" />}
                </div>
                <div className="flex items-center justify-between gap-2 text-[0.9375rem]">
                  <span>{t("page", { page: i + 1 })}</span>
                  {!busy && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={t("removePage", { page: i + 1 })}
                      className="text-pomegranate hover:bg-pom-tint inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold"
                    >
                      <X aria-hidden="true" className="size-4" />
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
          className={button("primary")}
        >
          <ScanText aria-hidden="true" />
          {t("read")}
        </button>
        <p role="status" className="text-staff-label2 m-0">
          {phase === "uploading" ? t("uploading") : phase === "reading" ? t("reading") : ""}
        </p>
      </div>
      {phase === "failed" && (
        <div
          role="alert"
          className="bg-pom-tint text-pomegranate flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
        >
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          <p className="m-0 flex-1">{t("errors.upload")}</p>
          <Link href="/admin/menu" className="inline-flex min-h-11 items-center font-semibold underline">
            {t("fillByHand")}
          </Link>
        </div>
      )}
    </div>
  );
}

"use client";

import { Check, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/features/admin-ui/toast";
import { button, check } from "@/features/admin-ui/styles";
import { useId, useState, useTransition } from "react";
import { resizeToWebp } from "@/features/menu/photo";
import { getBrowserClient } from "@/lib/supabase/browser";
import { saveAppearance, type AppearanceInput } from "./actions";
import { GUEST_THEMES, brandStyle, type GuestTheme } from "./themes";

const DEFAULT_PICK = "#c2185b";
const logoUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;

// A guest screen in miniature, drawn with the theme's real tokens (each
// preview is its own .guest-lux), so what the owner picks is what guests get.
function Preview({
  theme,
  brandColor,
  title,
}: {
  theme: GuestTheme;
  brandColor: string | null;
  title: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="guest-lux bg-page text-ink relative block h-44 overflow-hidden rounded-xl p-3"
      data-guest-theme={theme}
      data-guest-preview=""
      style={brandStyle(theme, brandColor)}
    >
      <span className="display-face block text-[1.75rem] leading-none">{title}</span>
      <span className="mt-3 grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="bg-surface shadow-card rounded-card block border [border-color:var(--guest-card-border)] p-2"
          >
            <span className="bg-plate shadow-plate mx-auto block size-9 rounded-full" />
            <span className="bg-ink/70 mx-auto mt-2 block h-1.5 w-3/4 rounded-full" />
            <span className="bg-accent-text mx-auto mt-1 block h-1.5 w-1/3 rounded-full" />
          </span>
        ))}
      </span>
      <span className="bg-accent text-on-accent rounded-pill absolute inset-x-3 bottom-3 flex h-6 items-center px-2">
        <span className="block h-1.5 w-1/3 rounded-full bg-current opacity-80" />
      </span>
    </span>
  );
}

export function AppearanceForm({
  restaurantId,
  ready,
  initial,
}: {
  restaurantId: string;
  ready: boolean;
  initial: AppearanceInput;
}) {
  const t = useTranslations("look");
  const ids = useId();
  const [theme, setTheme] = useState<GuestTheme>(initial.theme);
  const [useColor, setUseColor] = useState(initial.brandColor !== null);
  const [color, setColor] = useState(initial.brandColor ?? DEFAULT_PICK);
  const [logo, setLogo] = useState(initial.logoPath);
  const [upload, setUpload] = useState<"idle" | "uploading" | "failed">("idle");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [saving, startSaving] = useTransition();
  const toast = useToast();
  const brandColor = useColor ? color : null;
  const weak =
    brandColor !== null && !(brandStyle(theme, brandColor) as Record<string, string>)["--guest-accent-text"];

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setUpload("uploading");
    setStatus("idle");
    try {
      const blob = await resizeToWebp(file, 256, 0.88);
      const path = `${restaurantId}/logo/${Date.now()}.webp`;
      const { error } = await getBrowserClient()
        .storage.from("menu-images")
        .upload(path, blob, { contentType: "image/webp" });
      if (error) throw error;
      setLogo(path);
      setUpload("idle");
    } catch {
      setUpload("failed");
    }
  }

  function save() {
    setStatus("idle");
    startSaving(async () => {
      const result = await saveAppearance({ theme, brandColor, logoPath: logo });
      setStatus(result.ok ? "saved" : "failed");
      if (result.ok) toast(t("saved"));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={!ready}>
        <legend className="mb-2 px-1 text-[1.25rem] font-bold">{t("theme")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {GUEST_THEMES.map((id) => (
            <label
              key={id}
              className="ring-staff-sep has-[:checked]:ring-tarragon has-[:focus-visible]:outline-tarragon relative flex cursor-pointer flex-col gap-3 rounded-2xl bg-white p-3 ring-1 has-[:checked]:ring-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2"
              data-testid={`theme-${id}`}
            >
              <input
                type="radio"
                name={`${ids}-theme`}
                value={id}
                checked={theme === id}
                onChange={() => {
                  setTheme(id);
                  setStatus("idle");
                }}
                className="sr-only"
              />
              <Preview theme={id} brandColor={brandColor} title={t("previewTitle")} />
              <span className="flex items-start gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[1.0625rem] font-semibold">{t(`themes.${id}.name`)}</span>
                  <span className="text-staff-label2 text-[0.9375rem]">{t(`themes.${id}.hint`)}</span>
                </span>
                {/* Ticked as well as ringed: the choice never rests on colour alone. */}
                <span
                  aria-hidden="true"
                  className={`grid size-6 shrink-0 place-items-center rounded-full ${theme === id ? "bg-tarragon text-white" : "ring-staff-field ring-1"}`}
                >
                  {theme === id && <Check className="size-4" />}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section
        className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5"
        aria-labelledby={`${ids}-color`}
      >
        <h2 id={`${ids}-color`} className="m-0 text-[1.25rem] font-bold">
          {t("color")}
        </h2>
        <p className="text-staff-label2 m-0">{t("colorHint")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-11 items-center gap-3 text-[1.0625rem] font-semibold">
            <input
              type="checkbox"
              checked={useColor}
              onChange={(e) => {
                setUseColor(e.target.checked);
                setStatus("idle");
              }}
              className={check}
            />
            {t("colorUse")}
          </label>
          <input
            type="color"
            value={color}
            disabled={!useColor}
            aria-label={t("color")}
            onChange={(e) => {
              setColor(e.target.value);
              setStatus("idle");
            }}
            className="border-staff-field h-12 w-20 cursor-pointer rounded-xl border bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {useColor && <code className="num text-staff-label2">{color}</code>}
        </div>
        {weak && <p className="m-0 rounded-xl bg-[#fdf0dc] px-3 py-2 text-[0.9375rem]">{t("colorWeak")}</p>}
      </section>

      <section
        className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5"
        aria-labelledby={`${ids}-logo`}
      >
        <h2 id={`${ids}-logo`} className="m-0 text-[1.25rem] font-bold">
          {t("logo")}
        </h2>
        <p className="text-staff-label2 m-0">{t("logoHint")}</p>
        <div className="flex flex-wrap items-center gap-4">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
            <img
              src={logoUrl(logo)}
              alt=""
              width={64}
              height={64}
              className="bg-staff-fill size-16 rounded-full object-cover"
            />
          )}
          <label
            className={button(
              "tinted",
              "has-[:focus-visible]:outline-tarragon cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
            )}
          >
            <ImagePlus aria-hidden="true" />
            {upload === "uploading" ? t("uploading") : t("logoChoose")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={upload === "uploading"}
              onChange={(e) => void pickLogo(e.target.files?.[0])}
            />
          </label>
          {logo && (
            <button
              type="button"
              onClick={() => {
                setLogo(null);
                setStatus("idle");
              }}
              className={button("danger")}
            >
              <Trash2 aria-hidden="true" />
              {t("logoRemove")}
            </button>
          )}
        </div>
        {upload === "failed" && (
          <p role="alert" className="text-pomegranate m-0 text-[0.9375rem] font-semibold">
            {t("uploadFailed")}
          </p>
        )}
      </section>

      <div className="border-staff-sep bg-staff-bg/95 sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-4 border-t px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          onClick={save}
          disabled={!ready || saving || upload === "uploading"}
          className={button("primary", "min-w-40")}
        >
          {saving ? t("saving") : t("save")}
        </button>
        <p
          role="status"
          className={`m-0 font-semibold ${status === "failed" ? "text-pomegranate" : "text-tarragon"}`}
        >
          {status === "failed" ? t("failed") : null}
        </p>
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle, Check, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/features/admin-ui/toast";
import { button, check, field, fieldLabel } from "@/features/admin-ui/styles";
import { useId, useState, useTransition, type ReactNode } from "react";
import { resizeToWebp } from "@/features/menu/photo";
import { getBrowserClient } from "@/lib/supabase/browser";
import { saveAppearance, saveBrand, type AppearanceInput } from "./actions";
import {
  BODY_FONTS,
  BRAND_COLOR_ROLES,
  HEADING_FONTS,
  PLATE_STYLES,
  SCRIPT_FONTS,
  brandJson,
  brandTokens,
  ignoredRoles,
  type Brand,
  type BrandColorRole,
  type BrandFont,
  type PlateStyle,
} from "./brand";
import { BrandPreview } from "./brand-preview";
import { RECOMMENDED_THEME, THEME_CHOICES, THEME_FACTS, contrast, type GuestTheme } from "./themes";

const logoUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;
const HEX = /^#[0-9a-f]{6}$/i;

// What a colour picker starts at when a role is switched on: the theme's own
// colour for that job, so nothing jumps until the owner picks.
function startColor(theme: GuestTheme, role: BrandColorRole): string {
  const f = THEME_FACTS[theme];
  return {
    header: f.ink,
    accent: f.dark ? "#ffc7c6" : "#8a5a00",
    highlight: "#e0a33a",
    line: "#e1e4e9",
    page: f.page,
  }[role];
}

// A guest screen in miniature for each theme card, drawn with the theme's
// real tokens and the brand on top (each preview is its own .guest-lux).
function ThemeSwatch({
  theme,
  brand,
  legacyColor,
  title,
}: {
  theme: GuestTheme;
  brand: Brand;
  legacyColor: string | null;
  title: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="guest-lux bg-page text-ink relative block h-44 overflow-hidden rounded-xl p-3"
      data-guest-theme={theme}
      data-guest-preview=""
      data-plate={brand.plate ?? undefined}
      style={brandTokens(theme, brand, legacyColor).style}
    >
      <span className="display-face text-title block text-[1.75rem] leading-none">{title}</span>
      <span className="mt-3 grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="bg-surface shadow-card rounded-card block border [border-color:var(--guest-card-border)] p-2"
          >
            <span className="bg-dish shadow-plate mx-auto block size-9 rounded-full" />
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

function Group({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5" aria-labelledby={id}>
      <h2 id={id} className="m-0 text-[1.25rem] font-bold">
        {title}
      </h2>
      {hint && <p className="text-staff-label2 m-0">{hint}</p>}
      {children}
    </section>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="border-amber bg-amber/15 m-0 flex items-start gap-2 rounded-xl border px-3 py-2 text-[0.9375rem]">
      <AlertTriangle aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const fileLabel = button(
  "tinted",
  "has-[:focus-visible]:outline-ink cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
);

export function AppearanceForm({
  restaurantId,
  ready,
  brandReady,
  cafeName,
  cover,
  initial,
  initialBrand,
}: {
  restaurantId: string;
  ready: boolean;
  /** restaurants.brand exists (migration 20261119100000_brand_profile applied). */
  brandReady: boolean;
  cafeName: string;
  /** A section cover for the preview, if the café has one. */
  cover: string | null;
  initial: AppearanceInput;
  initialBrand: Brand;
}) {
  const t = useTranslations("look");
  const b = useTranslations("look.brand");
  const ids = useId();
  const [theme, setTheme] = useState<GuestTheme>(initial.theme);
  // Before the brand profile, the single brand colour was the header/buttons role.
  const [brand, setBrand] = useState<Brand>(() =>
    initialBrand.colors.header || !initial.brandColor
      ? initialBrand
      : { ...initialBrand, colors: { ...initialBrand.colors, header: initial.brandColor } },
  );
  const [drafts, setDrafts] = useState<Partial<Record<BrandColorRole, string>>>({});
  const [off, setOff] = useState<Partial<Record<BrandColorRole, string>>>({});
  const [logo, setLogo] = useState(initial.logoPath);
  const [upload, setUpload] = useState<"idle" | "uploading" | "failed">("idle");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [saving, startSaving] = useTransition();
  const toast = useToast();

  const header = brand.colors.header ?? null;
  const ignored = ignoredRoles(theme, brand);
  const pageColor =
    brand.colors.page && !ignored.includes("page") ? brand.colors.page : THEME_FACTS[theme].page;

  const change = (next: Partial<Brand>) => {
    setBrand((cur) => ({ ...cur, ...next }));
    setStatus("idle");
  };
  const setColor = (role: BrandColorRole, value: string | null) => {
    setBrand((cur) => {
      const colors = { ...cur.colors };
      if (value) colors[role] = value.toLowerCase();
      else delete colors[role];
      return { ...cur, colors };
    });
    setStatus("idle");
  };

  async function uploadImage(
    file: File | undefined,
    folder: "logo" | "brand",
    onDone: (path: string) => void,
  ) {
    if (!file) return;
    setUpload("uploading");
    setStatus("idle");
    try {
      // The round emblem is small; the wordmark keeps its shape up to 800 px wide.
      const blob = await resizeToWebp(file, folder === "logo" ? 256 : 800, 0.88);
      const path = `${restaurantId}/${folder}/${Date.now()}.webp`;
      const { error } = await getBrowserClient()
        .storage.from("menu-images")
        .upload(path, blob, { contentType: "image/webp" });
      if (error) throw error;
      onDone(path);
      setUpload("idle");
    } catch {
      setUpload("failed");
    }
  }

  function save() {
    setStatus("idle");
    startSaving(async () => {
      const look = await saveAppearance({ theme, brandColor: header, logoPath: logo });
      const result = look.ok && brandReady ? await saveBrand(brandJson(brand)) : look;
      setStatus(result.ok ? "saved" : "failed");
      if (result.ok) toast(t("saved"));
    });
  }

  const fontSelect = (
    key: "headingFont" | "bodyFont" | "scriptFont",
    label: string,
    fonts: readonly BrandFont[],
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className={fieldLabel}>{label}</span>
      <select
        value={brand[key] ?? ""}
        onChange={(e) => change({ [key]: e.target.value || null })}
        className={`${field} h-12`}
        data-testid={`font-${key}`}
      >
        <option value="">{b("themeFont")}</option>
        {fonts.map((f) => (
          <option key={f.family} value={f.family}>
            {f.family}
          </option>
        ))}
      </select>
      {hint && <span className="text-staff-label2 text-[0.8125rem]">{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={!ready}>
        <legend className="mb-2 px-1 text-[1.25rem] font-bold">{t("theme")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_CHOICES.map((id) => (
            <label
              key={id}
              className="has-[:checked]:ring-ink has-[:focus-visible]:outline-ink relative flex cursor-pointer flex-col gap-3 rounded-2xl bg-white p-3 ring-0 has-[:checked]:ring-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2"
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
              <ThemeSwatch theme={id} brand={brand} legacyColor={header} title={t("previewTitle")} />
              <span className="flex items-start gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1.0625rem] font-semibold">
                    {t(`themes.${id}.name`)}
                    {id === RECOMMENDED_THEME && (
                      <span className="bg-staff-fill text-ink rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold">
                        {t("recommended")}
                      </span>
                    )}
                  </span>
                  <span className="text-staff-label2 text-[0.9375rem]">{t(`themes.${id}.hint`)}</span>
                </span>
                {/* Ticked as well as ringed: the choice never rests on colour alone. */}
                <span
                  aria-hidden="true"
                  className={`grid size-6 shrink-0 place-items-center rounded-full ${theme === id ? "bg-ink text-white" : "ring-staff-field ring-1"}`}
                >
                  {theme === id && <Check className="size-4" />}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <fieldset className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0" disabled={!ready}>
          <legend className="sr-only">{b("title")}</legend>
          <Group id={`${ids}-colors`} title={b("colors")} hint={b("colorsHint")}>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {BRAND_COLOR_ROLES.map((role) => {
                const value = brand.colors[role];
                const on = Boolean(value);
                const shown = value ?? off[role] ?? startColor(theme, role);
                const name = b(`roles.${role}.name`);
                // Only the roles that are text on the page get a ratio (badges carry their own text).
                const ratio =
                  value && (role === "header" || role === "accent")
                    ? contrast(value, pageColor).toFixed(1)
                    : null;
                // The brand only colours text where it can; brand.ts says which roles it ignored.
                const weak = on && (role === "accent" || role === "page") && ignored.includes(role);
                return (
                  <li key={role} className="flex flex-col gap-2" data-testid={`role-${role}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <label className="flex min-h-11 min-w-0 flex-1 basis-56 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            if (!e.target.checked && value) setOff((o) => ({ ...o, [role]: value }));
                            setColor(role, e.target.checked ? shown : null);
                          }}
                          className={check}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[1.0625rem] font-semibold">{name}</span>
                          <span className="text-staff-label2 text-[0.9375rem]">
                            {b(`roles.${role}.hint`)}
                          </span>
                        </span>
                      </label>
                      <span className="flex items-center gap-2">
                        <input
                          type="color"
                          value={shown}
                          disabled={!on}
                          aria-label={name}
                          onChange={(e) => {
                            setColor(role, e.target.value);
                            setDrafts((d) => ({ ...d, [role]: undefined }));
                          }}
                          className="border-staff-field h-12 w-16 cursor-pointer rounded-xl border bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <input
                          type="text"
                          inputMode="text"
                          spellCheck={false}
                          maxLength={7}
                          disabled={!on}
                          aria-label={b("hex", { role: name })}
                          value={drafts[role] ?? shown}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setDrafts((d) => ({ ...d, [role]: v }));
                            if (HEX.test(v)) setColor(role, v);
                          }}
                          onBlur={() => setDrafts((d) => ({ ...d, [role]: undefined }))}
                          className={`${field} num h-12 w-28 font-mono disabled:opacity-50`}
                        />
                      </span>
                    </div>
                    {ratio && (
                      <span className="text-staff-label2 text-[0.8125rem]">{b("contrast", { ratio })}</span>
                    )}
                    {weak && <Warning>{b(`weak.${role as "accent" | "page"}`)}</Warning>}
                  </li>
                );
              })}
            </ul>
          </Group>

          <Group id={`${ids}-logo`} title={t("logo")} hint={t("logoHint")}>
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
              <label className={fileLabel}>
                <ImagePlus aria-hidden="true" />
                {upload === "uploading" ? t("uploading") : t("logoChoose")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={upload === "uploading"}
                  onChange={(e) => void uploadImage(e.target.files?.[0], "logo", setLogo)}
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
          </Group>

          <Group id={`${ids}-wordmark`} title={b("wordmark")} hint={b("wordmarkHint")}>
            <div className="flex flex-wrap items-center gap-4">
              {brand.wordmark && (
                // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
                <img
                  src={logoUrl(brand.wordmark)}
                  alt=""
                  height={56}
                  className="bg-staff-fill h-14 w-auto max-w-full rounded-xl object-contain p-1"
                />
              )}
              <label className={fileLabel}>
                <ImagePlus aria-hidden="true" />
                {upload === "uploading" ? t("uploading") : b("wordmarkChoose")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={upload === "uploading" || !brandReady}
                  onChange={(e) =>
                    void uploadImage(e.target.files?.[0], "brand", (wordmark) => change({ wordmark }))
                  }
                />
              </label>
              {brand.wordmark && (
                <button type="button" onClick={() => change({ wordmark: null })} className={button("danger")}>
                  <Trash2 aria-hidden="true" />
                  {b("wordmarkRemove")}
                </button>
              )}
            </div>
            {upload === "failed" && (
              <p role="alert" className="text-pomegranate m-0 text-[0.9375rem] font-semibold">
                {t("uploadFailed")}
              </p>
            )}
          </Group>

          <Group id={`${ids}-fonts`} title={b("fonts")} hint={b("fontsHint")}>
            <div className="grid gap-4 sm:grid-cols-3">
              {fontSelect("headingFont", b("heading"), HEADING_FONTS)}
              {fontSelect("bodyFont", b("body"), BODY_FONTS)}
              {fontSelect("scriptFont", b("script"), SCRIPT_FONTS, b("scriptHint"))}
            </div>
          </Group>

          <Group id={`${ids}-plate`} title={b("plate")} hint={b("plateHint")}>
            <div role="radiogroup" aria-labelledby={`${ids}-plate`} className="grid gap-2 sm:grid-cols-2">
              {([null, ...PLATE_STYLES] as (PlateStyle | null)[]).map((p) => (
                <label
                  key={p ?? "theme"}
                  className="has-[:checked]:ring-ink has-[:focus-visible]:outline-ink bg-staff-bg flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 has-[:checked]:ring-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2"
                >
                  <input
                    type="radio"
                    name={`${ids}-plate`}
                    checked={brand.plate === p}
                    onChange={() => change({ plate: p })}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`size-7 shrink-0 rounded-full ${
                      p === "porcelain"
                        ? "bg-white shadow-[0_0_0_1px_#d5d9df,0_4px_8px_-4px_rgb(0_0_0/0.4)]"
                        : p === "dark"
                          ? "bg-[#1e2126]"
                          : p === "none"
                            ? "border-staff-field border border-dashed"
                            : "bg-staff-fill"
                    }`}
                  />
                  <span className="flex-1 text-[1.0625rem] font-semibold">{b(`plates.${p ?? "theme"}`)}</span>
                  {brand.plate === p && <Check aria-hidden="true" className="size-5" />}
                </label>
              ))}
            </div>
          </Group>
        </fieldset>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-6" aria-labelledby={`${ids}-preview`}>
          <h2 id={`${ids}-preview`} className="m-0 text-[1.25rem] font-bold">
            {b("preview")}
          </h2>
          <p className="text-staff-label2 m-0">{b("previewHint")}</p>
          <BrandPreview
            theme={theme}
            brand={brand}
            legacyColor={header}
            cafeName={cafeName}
            logo={logo}
            cover={cover}
          />
        </aside>
      </div>

      <div className="border-staff-sep bg-staff-bg/95 sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-4 border-t px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          onClick={save}
          disabled={!ready || saving || upload === "uploading"}
          className={button("primary", "min-w-40")}
          data-testid="look-save"
        >
          {saving ? t("saving") : t("save")}
        </button>
        <p role="status" className="text-pomegranate m-0 font-semibold">
          {status === "failed" ? t("failed") : null}
        </p>
      </div>
    </div>
  );
}

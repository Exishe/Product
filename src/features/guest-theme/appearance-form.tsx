"use client";

import { AlertTriangle, Check, Eye, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/features/admin-ui/toast";
import { Sheet } from "@/features/admin-ui/sheet";
import { button, field, fieldLabel, sectionTitle, textAction } from "@/features/admin-ui/styles";
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
  isDarkBackground,
  type Brand,
  type BrandColorRole,
  type BrandFont,
  type PlateStyle,
} from "./brand";
import { BrandPreview, type PreviewDish } from "./brand-preview";
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
    // A group on the page (ADR-094): heading, hint, a hairline, then the content.
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby={id}>
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id={id} className={sectionTitle}>
          {title}
        </h2>
        {hint && <p className="text-staff-label2 m-0 text-label">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// The same switch the menu editor draws (48 × 28 track, green when on).
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none ${on ? "bg-tarragon" : "bg-staff-field"}`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] duration-150 motion-reduce:transition-none ${on ? "left-6" : "left-1"}`}
      />
    </span>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="bg-amber-tint m-0 flex items-start gap-2 rounded-xl px-3 py-2 text-label">
      <AlertTriangle aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const fileLabel = button(
  "secondary",
  "has-[:focus-visible]:outline-ink cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
);

export function AppearanceForm({
  restaurantId,
  ready,
  brandReady,
  cafeName,
  cover,
  sample,
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
  /** The café's first dishes with photos, so the preview shows its own food. */
  sample?: PreviewDish[];
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
  // The role whose colour code is open as a text field.
  const [editing, setEditing] = useState<BrandColorRole | null>(null);
  const [logo, setLogo] = useState(initial.logoPath);
  const [upload, setUpload] = useState<"idle" | "uploading" | "failed">("idle");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [saving, startSaving] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const toast = useToast();
  // What is saved, to tell whether anything changed since.
  const snapshot = JSON.stringify({ theme, brand, logo });
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

  const header = brand.colors.header ?? null;
  const ignored = ignoredRoles(theme, brand);
  const pageColor =
    brand.colors.page && !ignored.includes("page") ? brand.colors.page : THEME_FACTS[theme].page;

  // The two wordmark slots, each shown on the kind of background it is for:
  // the café's own page or header colour when that is light (dark), else a
  // plain light (dark) chip.
  const wordmarkSlots = [
    {
      key: "wordmark",
      title: b("wordmarkLight"),
      remove: b("wordmarkRemove"),
      chip: [pageColor, header].find((c) => c && !isDarkBackground(c)) ?? "#ffffff",
    },
    {
      key: "wordmarkDark",
      title: b("wordmarkDark"),
      remove: b("wordmarkRemoveDark"),
      chip: [header, pageColor].find((c) => c && isDarkBackground(c)) ?? "#1e2126",
    },
  ] as const;

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
      if (result.ok) {
        setSavedSnapshot(snapshot);
        toast(t("saved"));
      }
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
      {hint && <span className="text-staff-label2 text-label">{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-10">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={!ready}>
        <legend className={`mb-2 ${sectionTitle}`}>{t("theme")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_CHOICES.map((id) => (
            <label
              key={id}
              // No frame on the choices: the miniature is the tile. Only the
              // chosen one gets a 2 px ink ring (and the tick below).
              className="has-[:checked]:ring-ink has-[:focus-visible]:outline-ink hover:bg-staff-bg relative flex cursor-pointer flex-col gap-3 rounded-[var(--radius-soft)] bg-white p-3 has-[:checked]:ring-2 has-[:checked]:hover:bg-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2"
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
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-name font-semibold">
                    {t(`themes.${id}.name`)}
                    {id === RECOMMENDED_THEME && (
                      <span className="bg-staff-fill text-ink rounded-full px-2 py-0.5 text-meta font-semibold">
                        {t("recommended")}
                      </span>
                    )}
                  </span>
                  <span className="text-staff-label2 text-label">{t(`themes.${id}.hint`)}</span>
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
        <fieldset className="m-0 flex min-w-0 flex-col gap-10 border-0 p-0" disabled={!ready}>
          <legend className="sr-only">{b("title")}</legend>
          <Group id={`${ids}-colors`} title={b("colors")} hint={b("colorsHint")}>
            <ul className="m-0 -mt-2 flex list-none flex-col p-0">
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
                const weak =
                  on && (role === "accent" || role === "page" || role === "line") && ignored.includes(role);
                return (
                  <li
                    key={role}
                    className="border-staff-sep flex flex-col gap-1 border-b py-2 last:border-0"
                    data-testid={`role-${role}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {/* "Use my own colour" is a switch named by the role:
                          off, the theme's colour shows; on, the chip is yours. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-labelledby={`${ids}-${role}-name`}
                        aria-describedby={`${ids}-${role}-hint`}
                        onClick={() => {
                          if (on && value) setOff((o) => ({ ...o, [role]: value }));
                          setColor(role, on ? null : shown);
                        }}
                        className="flex min-h-12 min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3 rounded-lg text-left"
                      >
                        <Switch on={on} />
                        <span className="flex min-w-0 flex-col">
                          <span id={`${ids}-${role}-name`} className="text-name font-semibold">
                            {name}
                          </span>
                          <span id={`${ids}-${role}-hint`} className="text-staff-label2 text-label">
                            {b(`roles.${role}.hint`)}
                            {!on && ` · ${b("themeColor")}`}
                          </span>
                        </span>
                      </button>
                      {/* The value: a round chip that opens the colour picker
                          and the code beside it, which turns into a field on
                          tap. The reading check sits on the same line. */}
                      <span className="ml-auto flex items-center gap-1">
                        {ratio && (
                          <span
                            className={`mr-2 text-label font-semibold ${Number(ratio) >= 4.5 ? "text-tarragon" : "text-pomegranate"}`}
                            title={b("contrast", { ratio })}
                          >
                            {Number(ratio) >= 4.5 ? b("readsWell") : b("readsPoorly")}
                          </span>
                        )}
                        <label
                          className={`relative grid size-11 shrink-0 place-items-center rounded-full has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ink ${on ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        >
                          <span
                            aria-hidden="true"
                            className="size-8 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
                            style={{ background: shown }}
                          />
                          <input
                            type="color"
                            value={shown}
                            disabled={!on}
                            aria-label={name}
                            onChange={(e) => {
                              setColor(role, e.target.value);
                              setDrafts((d) => ({ ...d, [role]: undefined }));
                            }}
                            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                          />
                        </label>
                        {editing === role ? (
                          <input
                            type="text"
                            inputMode="text"
                            spellCheck={false}
                            maxLength={7}
                            autoFocus
                            aria-label={b("hex", { role: name })}
                            value={drafts[role] ?? shown}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              setDrafts((d) => ({ ...d, [role]: v }));
                              if (HEX.test(v)) setColor(role, v);
                            }}
                            onBlur={() => {
                              setDrafts((d) => ({ ...d, [role]: undefined }));
                              setEditing(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                            }}
                            className={`${field} num h-11 !w-[6.5rem] px-2 font-mono text-[0.9375rem] uppercase`}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={!on}
                            aria-label={b("hex", { role: name })}
                            onClick={() => setEditing(role)}
                            className="hover:bg-staff-fill min-h-11 w-[6.5rem] cursor-pointer rounded-lg px-2 text-left font-mono text-[0.9375rem] text-ink uppercase disabled:cursor-not-allowed disabled:text-staff-label2"
                          >
                            {shown}
                          </button>
                        )}
                      </span>
                    </div>
                    {weak && <Warning>{b(`weak.${role as "accent" | "page" | "line"}`)}</Warning>}
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
                  className={textAction("danger")}
                >
                  <Trash2 aria-hidden="true" />
                  {t("logoRemove")}
                </button>
              )}
            </div>
          </Group>

          <Group id={`${ids}-wordmark`} title={b("wordmark")} hint={b("wordmarkHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {wordmarkSlots.map((slot) => {
                const path = brand[slot.key];
                return (
                  <div
                    key={slot.key}
                    role="group"
                    aria-labelledby={`${ids}-${slot.key}`}
                    className="flex min-w-0 flex-col gap-3"
                    data-testid={`slot-${slot.key}`}
                  >
                    <h3 id={`${ids}-${slot.key}`} className="m-0 text-name font-semibold">
                      {slot.title}
                    </h3>
                    {/* The chip is the background the picture is meant for. */}
                    <span
                      className="border-staff-field grid h-24 place-items-center rounded-xl border p-3"
                      style={{ background: slot.chip }}
                      data-testid={`chip-${slot.key}`}
                    >
                      {path && (
                        // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
                        <img
                          src={logoUrl(path)}
                          alt=""
                          height={56}
                          className="h-14 w-auto max-w-full object-contain"
                        />
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={fileLabel}>
                        <ImagePlus aria-hidden="true" />
                        {upload === "uploading" ? t("uploading") : b("wordmarkChoose")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          aria-describedby={`${ids}-${slot.key}`}
                          disabled={upload === "uploading" || !brandReady}
                          onChange={(e) =>
                            void uploadImage(e.target.files?.[0], "brand", (uploaded) =>
                              change({ [slot.key]: uploaded }),
                            )
                          }
                        />
                      </label>
                      {path && (
                        <button
                          type="button"
                          onClick={() => change({ [slot.key]: null })}
                          className={textAction("danger")}
                        >
                          <Trash2 aria-hidden="true" />
                          {slot.remove}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {upload === "failed" && (
              <p role="alert" className="text-pomegranate m-0 text-label font-semibold">
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
            {/* A radio list on hairlines (ADR-094), not a grid of boxes. */}
            <div role="radiogroup" aria-labelledby={`${ids}-plate`} className="flex flex-col">
              {([null, ...PLATE_STYLES] as (PlateStyle | null)[]).map((p) => (
                <label
                  key={p ?? "theme"}
                  className="border-staff-sep has-[:focus-visible]:outline-ink flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-b py-1.5 last:border-0 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2"
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
                  <span className={`flex-1 text-name ${brand.plate === p ? "font-semibold" : "font-medium"}`}>
                    {b(`plates.${p ?? "theme"}`)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`grid size-6 shrink-0 place-items-center rounded-full ${brand.plate === p ? "bg-ink text-white" : "ring-staff-field ring-1"}`}
                  >
                    {brand.plate === p && <Check className="size-4" />}
                  </span>
                </label>
              ))}
            </div>
          </Group>
        </fieldset>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-6" aria-labelledby={`${ids}-preview`}>
          <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
            <h2 id={`${ids}-preview`} className="m-0 text-heading font-semibold">
              {b("preview")}
            </h2>
            <p className="text-staff-label2 m-0 text-label">{b("previewHint")}</p>
          </div>
          <BrandPreview
            theme={theme}
            brand={brand}
            legacyColor={header}
            cafeName={cafeName}
            logo={logo}
            cover={cover}
            sample={sample}
          />
        </aside>
      </div>

      {/* Phone: a solid bar pinned to the bottom with the preview one tap away
          and Save once something changed. From 640 px it is a plain row (the
          preview sits next to the form from 1024 px). */}
      <div className="border-staff-sep sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:static sm:mx-0 sm:border-0 sm:p-0">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className={button("secondary", "shrink-0 lg:hidden")}
          data-testid="look-preview-open"
        >
          <Eye aria-hidden="true" />
          {b("preview")}
        </button>
        {dirty || status === "failed" ? (
          <button
            type="button"
            onClick={save}
            disabled={!ready || saving || upload === "uploading"}
            className={button("primary", "min-h-13 flex-1 sm:min-w-40 sm:flex-none")}
            data-testid="look-save"
          >
            {saving ? t("saving") : t("save")}
          </button>
        ) : (
          <p className="text-staff-label2 m-0 flex flex-1 items-center gap-2 text-label font-semibold sm:flex-none">
            <Check aria-hidden="true" className="text-tarragon size-5" />
            {t("allSaved")}
          </p>
        )}
        <p role="status" className="text-pomegranate m-0 font-semibold">
          {status === "failed" ? t("failed") : null}
        </p>
      </div>
      {previewOpen && (
        <Sheet title={b("preview")} closeLabel={b("previewClose")} onClose={() => setPreviewOpen(false)}>
          <BrandPreview
            theme={theme}
            brand={brand}
            legacyColor={header}
            cafeName={cafeName}
            logo={logo}
            cover={cover}
            sample={sample}
          />
        </Sheet>
      )}
    </div>
  );
}

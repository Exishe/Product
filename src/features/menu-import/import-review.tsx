"use client";

import {
  CircleAlert,
  CircleCheck,
  Image as ImageIcon,
  ListChecks,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs, tabPanel } from "@/features/admin-ui/tabs";
import { button, check, field as baseField } from "@/features/admin-ui/styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { applyImport, discardImport, saveDraft, type ApplyResult } from "./actions";
import { IMPORT_LOCALES, LOW_CONFIDENCE, type DraftItem, type ImportLocale, type MenuDraft } from "./schema";
import { ImportSteps } from "./steps";

type Props = { importId: string; initial: MenuDraft; photos: { page: number; url: string }[] };

const field = baseField;
const OTHER_LOCALES = IMPORT_LOCALES.filter((l) => l !== "hy");

function digits(raw: string): number | null {
  const compact = raw.replace(/[\s ֏]/gu, "");
  return /^\d{1,8}$/u.test(compact) ? Number(compact) : null;
}

const needsPrice = (item: DraftItem) =>
  item.price_amd === null || item.variants.some((v) => v.price_amd === null);

// Step 3: the photo next to what was read from it. The owner fixes names and
// prices, ticks each dish, and adds the result to the menu or publishes it.
export function ImportReview({ importId, initial, photos }: Props) {
  const t = useTranslations("menuImport");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [photo, setPhoto] = useState(0);
  // Below 1024 px the photo and the dishes share the screen as two tabs.
  const [view, setView] = useState<"dishes" | "photo">("dishes");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Keep the owner's edits if the page is closed halfway.
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false;
      return;
    }
    const timer = setTimeout(() => void saveDraft(importId, draft), 1500);
    return () => clearTimeout(timer);
  }, [draft, importId]);

  const items = draft.categories.flatMap((c) => c.items);
  const checked = items.filter((i) => i.reviewed).length;
  const missing = items.filter(needsPrice).length;
  const allChecked = items.length > 0 && checked === items.length;

  function editCategory(
    ci: number,
    change: (c: MenuDraft["categories"][number]) => MenuDraft["categories"][number],
  ) {
    setDraft((d) => ({ ...d, categories: d.categories.map((c, x) => (x === ci ? change(c) : c)) }));
  }

  function editItem(ci: number, ii: number, patch: Partial<DraftItem>) {
    editCategory(ci, (c) => ({ ...c, items: c.items.map((it, y) => (y === ii ? { ...it, ...patch } : it)) }));
  }

  function apply(publish: boolean) {
    startTransition(async () => {
      setResult(await applyImport(importId, draft, publish));
    });
  }

  function discard() {
    startTransition(async () => {
      await discardImport(importId);
      router.push("/admin/menu/import");
    });
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-8">
        <ImportSteps current="publish" />
        <section role="status" className="flex flex-col items-start gap-4 rounded-2xl bg-white p-6 sm:p-8">
          <CircleCheck aria-hidden="true" className="text-tarragon size-10" />
          <h2 className="m-0 text-[1.75rem] leading-tight font-bold">
            {result.published ? t("doneTitle") : t("addedTitle", { count: result.dishes })}
          </h2>
          <p className="m-0 max-w-2xl text-[1.0625rem]">
            {result.published ? t("doneText") : t("addedText")}
          </p>
          <Link href="/admin/menu" className={button("primary")}>
            {t("openEditor")}
          </Link>
        </section>
      </div>
    );
  }

  const current = photos[photo];

  return (
    <div className="flex flex-col gap-5 pb-56 sm:pb-44">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ImportSteps current="review" />
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          className={button("danger", "min-h-11 text-[0.9375rem]")}
        >
          <Trash2 aria-hidden="true" className="!size-4" />
          {t("discard")}
        </button>
      </div>
      <p className="bg-amber-tint m-0 flex max-w-3xl items-start gap-3 rounded-2xl px-4 py-3 text-[1.0625rem]">
        <TriangleAlert aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
        {t("reviewNotice")}
      </p>

      {current && (
        <Tabs
          id="import-view"
          label={t("viewLabel")}
          value={view}
          onChange={setView}
          items={[
            {
              key: "dishes",
              label: (
                <>
                  <ListChecks aria-hidden="true" />
                  {t("dishesTab")}
                </>
              ),
            },
            {
              key: "photo",
              label: (
                <>
                  <ImageIcon aria-hidden="true" />
                  {t("photos")}
                </>
              ),
            },
          ]}
          className="sticky top-14 z-20 lg:hidden"
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {current && (
          <div
            {...tabPanel("import-view", "photo")}
            className={`lg:sticky lg:top-6 lg:self-start ${view === "photo" ? "" : "max-lg:hidden"}`}
            data-testid="photos"
          >
            <figure className="m-0 flex flex-col gap-3">
              {photos.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <button
                      key={p.page}
                      type="button"
                      onClick={() => setPhoto(i)}
                      aria-pressed={i === photo}
                      className={`min-h-11 rounded-full px-4 font-semibold ${i === photo ? "bg-ink text-white" : "text-ink bg-white"}`}
                    >
                      {t("page", { page: p.page })}
                    </button>
                  ))}
                </div>
              )}
              <a href={current.url} target="_blank" rel="noreferrer" aria-label={t("openPhoto")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to the private photo */}
                <img
                  src={current.url}
                  alt={t("photoOf", { page: current.page, total: photos.length })}
                  className="max-h-[75vh] w-full rounded-2xl bg-white object-contain"
                />
              </a>
              <figcaption className="text-staff-label2 text-[0.9375rem]">
                {t("photoOf", { page: current.page, total: photos.length })}
              </figcaption>
            </figure>
          </div>
        )}

        <div
          {...(current ? tabPanel("import-view", "dishes") : {})}
          className={`flex min-w-0 flex-col gap-8 ${view === "dishes" ? "" : "max-lg:hidden"}`}
        >
          {draft.categories.map((category, ci) => {
            if (category.items.length === 0) return null;
            const sectionChecked = category.items.every((i) => i.reviewed);
            return (
              <section key={ci} aria-labelledby={`section-${ci}`} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-3">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span id={`section-${ci}`} className="sr-only">
                      {t("sectionName")}
                    </span>
                    <input
                      lang="hy"
                      value={category.names.hy}
                      onChange={(e) =>
                        editCategory(ci, (c) => ({ ...c, names: { ...c.names, hy: e.target.value } }))
                      }
                      className="border-staff-field w-full rounded-xl border bg-white px-3 py-1.5 text-[1.5rem] font-bold"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={sectionChecked}
                    onClick={() =>
                      editCategory(ci, (c) => ({
                        ...c,
                        items: c.items.map((it) => ({ ...it, reviewed: true })),
                      }))
                    }
                    className={button(sectionChecked ? "tinted" : "secondary", "min-h-11 text-[0.9375rem]")}
                  >
                    {sectionChecked && <CircleCheck aria-hidden="true" className="!size-4" />}
                    {sectionChecked ? t("sectionDone") : t("approveSection")}
                  </button>
                  <div className="grid w-full gap-2 sm:grid-cols-2">
                    {OTHER_LOCALES.map((l) => (
                      <label key={l} className="flex items-center gap-2 text-sm">
                        <span className="text-staff-label2 w-20 shrink-0">{t(`lang.${l}`)}</span>
                        <input
                          lang={l}
                          value={category.names[l]}
                          onChange={(e) =>
                            editCategory(ci, (c) => ({ ...c, names: { ...c.names, [l]: e.target.value } }))
                          }
                          className={`${field} h-11`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {category.items.map((item, ii) => (
                    <DishRow
                      key={ii}
                      item={item}
                      onChange={(patch) => editItem(ci, ii, patch)}
                      onRemove={() =>
                        editCategory(ci, (c) => ({ ...c, items: c.items.filter((_, y) => y !== ii) }))
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <footer className="border-staff-sep fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-48 flex-1 flex-col gap-2">
            <p className="num m-0 font-semibold">{t("progress", { done: checked, total: items.length })}</p>
            <div className="bg-staff-fill h-2 overflow-hidden rounded-full" aria-hidden="true">
              <div
                className="bg-ink h-full transition-[width] duration-200"
                style={{ width: `${items.length ? (checked / items.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <p role="status" className="text-staff-label2 m-0 flex-1 text-[0.9375rem]">
            {missing > 0
              ? t("missingPrices", { count: missing })
              : allChecked
                ? t("allChecked")
                : t("left", { count: items.length - checked })}
          </p>
          {!allChecked && (
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  categories: d.categories.map((c) => ({
                    ...c,
                    items: c.items.map((it) => ({ ...it, reviewed: true })),
                  })),
                }))
              }
              className={button("plain")}
            >
              <ListChecks aria-hidden="true" />
              {t("markAll")}
            </button>
          )}
          {allChecked ? (
            <button
              type="button"
              onClick={() => apply(true)}
              disabled={pending || missing > 0}
              className={button("primary")}
            >
              {pending ? t("working") : t("publish")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => apply(false)}
              disabled={pending || missing > 0 || items.length === 0}
              title={t("addToMenuHint")}
              className={button("tinted")}
            >
              {pending ? t("working") : t("addToMenu")}
            </button>
          )}
          {!allChecked && (
            <p className="text-staff-label2 m-0 w-full text-[0.8125rem]">{t("addToMenuHint")}</p>
          )}
          {result && !result.ok && (
            <p role="alert" className="text-pomegranate m-0 w-full font-semibold">
              {t(`errors.${result.error}`)}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

function DishRow({
  item,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("menuImport");
  const doubtful = !item.reviewed && (item.confidence < LOW_CONFIDENCE || needsPrice(item));
  const hasDescription = IMPORT_LOCALES.some((l) => item.descriptions[l] !== "");
  const label = item.names.hy || item.names.ru || item.names.en;

  return (
    <li
      data-testid="import-dish"
      className={`flex flex-col gap-3 rounded-2xl border-l-4 p-4 ${
        item.reviewed
          ? "border-ink bg-staff-fill/60"
          : doubtful
            ? "border-apricot bg-white"
            : "border-transparent bg-white"
      }`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-[3] flex-col gap-1">
          <span className="text-staff-label2 text-[0.9375rem]">{t("lang.hy")}</span>
          <input
            lang="hy"
            value={item.names.hy}
            aria-label={t("nameIn.hy")}
            onChange={(e) => onChange({ names: { ...item.names, hy: e.target.value } })}
            className={`${field} h-12 font-semibold`}
          />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="text-staff-label2 text-[0.9375rem]">{t("price")}</span>
          <input
            inputMode="numeric"
            value={item.price_amd ?? ""}
            aria-invalid={item.price_amd === null}
            onChange={(e) => onChange({ price_amd: digits(e.target.value) })}
            className={`${field} num h-12 text-right ${item.price_amd === null ? "border-pomegranate border-2" : ""}`}
          />
        </label>
        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-3 font-semibold">
          <input
            type="checkbox"
            checked={item.reviewed}
            onChange={(e) => onChange({ reviewed: e.target.checked })}
            className={check}
          />
          {t("correct")}
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeDishNamed", { name: label })}
          className="text-pomegranate hover:bg-pom-tint ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-semibold"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {t("remove")}
        </button>
      </div>

      {doubtful && (
        <p className="text-amber-text m-0 flex flex-wrap items-center gap-x-1.5 text-[0.9375rem] font-semibold">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {item.price_amd === null ? t("priceMissing") : t("checkDish")}
          {item.price_text && (
            <span className="text-staff-label2 ml-1 font-normal">
              {t("printed", { text: item.price_text })}
            </span>
          )}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {OTHER_LOCALES.map((l: ImportLocale) => (
          <label key={l} className="flex items-center gap-2 text-sm">
            <span className="text-staff-label2 w-20 shrink-0">{t(`lang.${l}`)}</span>
            <input
              lang={l}
              value={item.names[l]}
              aria-label={t(`nameIn.${l}`)}
              onChange={(e) => onChange({ names: { ...item.names, [l]: e.target.value } })}
              className={`${field} h-11`}
            />
          </label>
        ))}
      </div>

      {item.variants.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-staff-label2 mb-1 text-[0.9375rem] font-semibold">{t("sizes")}</legend>
          {item.variants.map((v, vi) => (
            <div key={vi} className="flex flex-wrap items-center gap-2">
              <input
                lang="hy"
                value={v.names.hy}
                aria-label={t("sizeNumber", { number: vi + 1 })}
                onChange={(e) =>
                  onChange({
                    variants: item.variants.map((x, y) =>
                      y === vi ? { ...x, names: { ...x.names, hy: e.target.value } } : x,
                    ),
                  })
                }
                className={`${field} h-11 w-40`}
              />
              <input
                inputMode="numeric"
                value={v.price_amd ?? ""}
                aria-label={t("sizePrice", { number: vi + 1 })}
                aria-invalid={v.price_amd === null}
                onChange={(e) =>
                  onChange({
                    variants: item.variants.map((x, y) =>
                      y === vi ? { ...x, price_amd: digits(e.target.value) } : x,
                    ),
                  })
                }
                className={`${field} num h-11 w-28 text-right`}
              />
            </div>
          ))}
        </fieldset>
      )}

      {hasDescription && (
        <details>
          <summary className="text-ink inline-flex min-h-11 cursor-pointer items-center rounded-lg text-[0.9375rem] font-semibold underline underline-offset-4">
            {t("descriptions")}
          </summary>
          <div className="mt-2 grid gap-2">
            {IMPORT_LOCALES.map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm">
                <span className="text-staff-label2 w-20 shrink-0">{t(`lang.${l}`)}</span>
                <input
                  lang={l}
                  value={item.descriptions[l]}
                  onChange={(e) => onChange({ descriptions: { ...item.descriptions, [l]: e.target.value } })}
                  className={`${field} h-11`}
                />
              </label>
            ))}
          </div>
        </details>
      )}
    </li>
  );
}

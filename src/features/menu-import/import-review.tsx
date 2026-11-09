"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { applyImport, discardImport, saveDraft, type ApplyResult } from "./actions";
import { IMPORT_LOCALES, LOW_CONFIDENCE, type DraftItem, type ImportLocale, type MenuDraft } from "./schema";
import { ImportSteps } from "./steps";

type Props = { importId: string; initial: MenuDraft; photos: { page: number; url: string }[] };

const field = "w-full rounded-input border border-line-strong bg-white px-3";
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
        <section
          role="status"
          className="rounded-sheet border-line flex flex-col items-start gap-4 border bg-white p-8"
        >
          <h2 className="display-face text-3xl">
            {result.published ? t("doneTitle") : t("addedTitle", { count: result.dishes })}
          </h2>
          <p className="max-w-2xl">{result.published ? t("doneText") : t("addedText")}</p>
          <Link
            href="/admin/menu"
            className="rounded-input bg-tarragon flex h-12 items-center px-6 font-semibold text-white"
          >
            {t("openEditor")}
          </Link>
        </section>
      </div>
    );
  }

  const current = photos[photo];

  return (
    <div className="flex flex-col gap-6 pb-40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ImportSteps current="review" />
        <button type="button" onClick={discard} disabled={pending} className="text-muted min-h-12 underline">
          {t("discard")}
        </button>
      </div>
      <p className="rounded-chip bg-apricot/20 max-w-3xl px-4 py-3">{t("reviewNotice")}</p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {current && (
          <details open className="group lg:sticky lg:top-6 lg:self-start" data-testid="photos">
            <summary className="mb-3 cursor-pointer font-semibold lg:hidden">{t("photos")}</summary>
            <figure className="flex flex-col gap-3">
              {photos.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <button
                      key={p.page}
                      type="button"
                      onClick={() => setPhoto(i)}
                      aria-pressed={i === photo}
                      className={`min-h-10 rounded-full border px-4 ${i === photo ? "border-tarragon bg-tarragon text-white" : "border-line-strong"}`}
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
                  className="rounded-chip border-line max-h-[75vh] w-full border bg-white object-contain"
                />
              </a>
              <figcaption className="text-muted text-sm">
                {t("photoOf", { page: current.page, total: photos.length })}
              </figcaption>
            </figure>
          </details>
        )}

        <div className="flex flex-col gap-10">
          {draft.categories.map((category, ci) => {
            if (category.items.length === 0) return null;
            const sectionChecked = category.items.every((i) => i.reviewed);
            return (
              <section key={ci} aria-labelledby={`section-${ci}`} className="flex flex-col gap-4">
                <div className="border-ink flex flex-wrap items-end gap-3 border-b-2 pb-3">
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
                      className="display-face border-line-strong rounded-input hover:border-line w-full border border-transparent bg-transparent px-2 py-1 text-3xl focus:bg-white"
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
                    className={`min-h-12 rounded-full px-4 font-semibold ${sectionChecked ? "bg-tarragon-tint text-tarragon" : "border-tarragon text-tarragon border"}`}
                  >
                    {sectionChecked ? t("sectionDone") : t("approveSection")}
                  </button>
                  <div className="grid w-full gap-2 sm:grid-cols-2">
                    {OTHER_LOCALES.map((l) => (
                      <label key={l} className="flex items-center gap-2 text-sm">
                        <span className="text-muted w-20 shrink-0">{t(`lang.${l}`)}</span>
                        <input
                          lang={l}
                          value={category.names[l]}
                          onChange={(e) =>
                            editCategory(ci, (c) => ({ ...c, names: { ...c.names, [l]: e.target.value } }))
                          }
                          className={`${field} h-10`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <ul className="flex flex-col gap-3">
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

      <footer className="border-line fixed inset-x-0 bottom-0 z-10 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-48 flex-1 flex-col gap-2">
            <p className="num font-semibold">{t("progress", { done: checked, total: items.length })}</p>
            <div className="bg-mist h-2 overflow-hidden rounded-full" aria-hidden="true">
              <div
                className="bg-tarragon h-full transition-[width]"
                style={{ width: `${items.length ? (checked / items.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <p role="status" className="text-muted flex-1">
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
              className="text-tarragon min-h-12 px-2 font-semibold underline"
            >
              {t("markAll")}
            </button>
          )}
          {allChecked ? (
            <button
              type="button"
              onClick={() => apply(true)}
              disabled={pending || missing > 0}
              className="rounded-input bg-tarragon h-12 px-6 font-semibold text-white disabled:opacity-50"
            >
              {pending ? t("working") : t("publish")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => apply(false)}
              disabled={pending || missing > 0 || items.length === 0}
              title={t("addToMenuHint")}
              className="rounded-input border-tarragon text-tarragon h-12 border-2 bg-white px-6 font-semibold disabled:opacity-50"
            >
              {pending ? t("working") : t("addToMenu")}
            </button>
          )}
          {!allChecked && <p className="text-muted w-full text-sm">{t("addToMenuHint")}</p>}
          {result && !result.ok && (
            <p role="alert" className="text-pomegranate w-full">
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
      className={`rounded-chip flex flex-col gap-3 border-l-4 p-4 ${
        item.reviewed
          ? "border-tarragon bg-tarragon-tint/60"
          : doubtful
            ? "border-apricot bg-white"
            : "border-line bg-white"
      }`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-[3] flex-col gap-1">
          <span className="text-muted text-sm">{t("lang.hy")}</span>
          <input
            lang="hy"
            value={item.names.hy}
            aria-label={t("nameIn.hy")}
            onChange={(e) => onChange({ names: { ...item.names, hy: e.target.value } })}
            className={`${field} display-face h-12 text-xl`}
          />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="text-muted text-sm">{t("price")}</span>
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
            className="accent-tarragon size-6"
          />
          {t("correct")}
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeDishNamed", { name: label })}
          className="text-pomegranate hover:bg-pom-tint ml-auto min-h-12 rounded-full px-3 text-sm font-semibold"
        >
          {t("remove")}
        </button>
      </div>

      {doubtful && (
        <p className="text-apricot-deep text-sm font-semibold">
          {item.price_amd === null ? t("priceMissing") : t("checkDish")}
          {item.price_text && (
            <span className="text-muted ml-2 font-normal">{t("printed", { text: item.price_text })}</span>
          )}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {OTHER_LOCALES.map((l: ImportLocale) => (
          <label key={l} className="flex items-center gap-2 text-sm">
            <span className="text-muted w-20 shrink-0">{t(`lang.${l}`)}</span>
            <input
              lang={l}
              value={item.names[l]}
              aria-label={t(`nameIn.${l}`)}
              onChange={(e) => onChange({ names: { ...item.names, [l]: e.target.value } })}
              className={`${field} h-10`}
            />
          </label>
        ))}
      </div>

      {item.variants.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-muted mb-1 text-sm font-semibold">{t("sizes")}</legend>
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
                className={`${field} h-10 w-40`}
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
                className={`${field} num h-10 w-28 text-right`}
              />
            </div>
          ))}
        </fieldset>
      )}

      {hasDescription && (
        <details>
          <summary className="text-muted cursor-pointer text-sm">{t("descriptions")}</summary>
          <div className="mt-2 grid gap-2">
            {IMPORT_LOCALES.map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm">
                <span className="text-muted w-20 shrink-0">{t(`lang.${l}`)}</span>
                <input
                  lang={l}
                  value={item.descriptions[l]}
                  onChange={(e) => onChange({ descriptions: { ...item.descriptions, [l]: e.target.value } })}
                  className={`${field} h-10`}
                />
              </label>
            ))}
          </div>
        </details>
      )}
    </li>
  );
}

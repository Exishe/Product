"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import { deleteDish, reorder, saveCategory, saveDish } from "./actions";
import { DISH_TAGS, parsePriceInput } from "./schema";
import { emptyNames, type EditorCategory, type EditorData, type EditorDish, type Names } from "./types";

const LOCALES = ["hy", "ru", "en"] as const;
const field = "w-full rounded-input border border-line-strong bg-white px-3";

type DishDraft = Omit<EditorDish, "id" | "sort" | "needsReview" | "imagePath" | "price"> & {
  id?: string;
  priceText: string;
  needsReview: boolean;
  markReviewed: boolean;
};
type CategoryDraft = { id?: string; names: Names; prepAreaId: string | null };
type Panel = { kind: "dish"; draft: DishDraft } | { kind: "category"; draft: CategoryDraft } | null;
type Status = "idle" | "saving" | "saved" | "failed" | "priceInvalid" | "nameRequired";

function nameFor(names: Names, locale: Locale): string {
  return names[locale] || names.hy;
}

export function MenuEditor({ data }: { data: EditorData }) {
  const t = useTranslations("menu");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(data.categories[0]?.id ?? null);
  const [panel, setPanel] = useState<Panel>(null);
  const [status, setStatus] = useState<Status>("idle");

  const category = data.categories.find((c) => c.id === selected) ?? null;
  const dishes = data.dishes.filter((d) => d.categoryId === selected).sort((a, b) => a.sort - b.sort);

  function open(next: Panel) {
    setPanel(next);
    setStatus("idle");
  }

  function openDish(d?: EditorDish) {
    open({
      kind: "dish",
      draft: d
        ? { ...d, priceText: String(d.price), markReviewed: false }
        : {
            categoryId: selected as string,
            priceText: "",
            prepAreaId: null,
            tags: [],
            names: emptyNames(),
            descriptions: emptyNames(),
            modifierGroupIds: [],
            needsReview: false,
            markReviewed: false,
          },
    });
  }

  function openCategory(c?: EditorCategory) {
    open({ kind: "category", draft: c ? { id: c.id, names: c.names, prepAreaId: c.prepAreaId } : { names: emptyNames(), prepAreaId: null } });
  }

  function move<T extends { id: string }>(list: T[], id: string, delta: -1 | 1, kind: "categories" | "items") {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    startTransition(async () => {
      await reorder(kind, ids);
      router.refresh();
    });
  }

  function submit() {
    if (!panel) return;
    if (!panel.draft.names.hy.trim()) return setStatus("nameRequired");
    setStatus("saving");
    startTransition(async () => {
      if (panel.kind === "category") {
        const result = await saveCategory({ ...panel.draft });
        if (!result.ok) return setStatus("failed");
        setSelected(result.id);
        setPanel(null);
      } else {
        const price = parsePriceInput(panel.draft.priceText);
        if (price === null) return setStatus("priceInvalid");
        const d = panel.draft;
        const result = await saveDish({
          id: d.id,
          categoryId: d.categoryId,
          price,
          names: d.names,
          descriptions: d.descriptions,
          prepAreaId: d.prepAreaId,
          tags: d.tags as (typeof DISH_TAGS)[number][],
          modifierGroupIds: d.modifierGroupIds,
          markReviewed: d.markReviewed,
        });
        if (!result.ok) return setStatus("failed");
        setPanel({ kind: "dish", draft: { ...d, id: result.id, needsReview: d.needsReview && !d.markReviewed } });
      }
      setStatus("saved");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteDish(id);
      setPanel(null);
      router.refresh();
    });
  }

  if (data.categories.length === 0 && panel === null) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-sheet border border-line bg-white p-8">
        <h2 className="display-face text-3xl">{t("emptyTitle")}</h2>
        <p className="text-muted">{t("emptyHint")}</p>
        <button type="button" onClick={() => openCategory()} className="h-12 rounded-input bg-tarragon px-6 font-semibold text-white">
          {t("emptyManual")}
        </button>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_minmax(340px,420px)]">
      <nav aria-label={t("categories")} className="flex flex-col gap-1">
        <h2 className="mb-1 text-sm font-semibold text-muted">{t("categories")}</h2>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {data.categories.map((c) => (
            <li key={c.id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setSelected(c.id);
                  setPanel(null);
                }}
                aria-current={c.id === selected ? "true" : undefined}
                className={`min-h-12 flex-1 rounded-chip px-3 text-left ${c.id === selected ? "bg-tarragon text-white" : "hover:bg-mist"}`}
              >
                {nameFor(c.names, locale)}
              </button>
              <span className="hidden lg:flex">
                <button type="button" aria-label={t("moveUp")} disabled={pending} onClick={() => move(data.categories, c.id, -1, "categories")} className="size-8 rounded-chip text-muted hover:bg-mist">
                  ↑
                </button>
                <button type="button" aria-label={t("moveDown")} disabled={pending} onClick={() => move(data.categories, c.id, 1, "categories")} className="size-8 rounded-chip text-muted hover:bg-mist">
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => openCategory()} className="mt-2 min-h-12 rounded-chip border border-dashed border-line-strong px-3 text-left text-tarragon">
          + {t("addCategory")}
        </button>
      </nav>

      <section aria-labelledby="dishes-heading" className="min-w-0">
        {category && (
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <h2 id="dishes-heading" className="display-face text-3xl">
              {nameFor(category.names, locale)}
            </h2>
            <button type="button" onClick={() => openCategory(category)} className="min-h-12 rounded-chip px-3 text-tarragon underline underline-offset-4">
              {t("editCategory")}
            </button>
            <button type="button" onClick={() => openDish()} className="ml-auto h-12 rounded-input bg-tarragon px-5 font-semibold text-white">
              + {t("addDish")}
            </button>
          </header>
        )}
        {category && dishes.length === 0 && <p className="text-muted">{t("emptyCategory")}</p>}
        <ul className="flex flex-col">
          {dishes.map((d) => (
            <li key={d.id} className="flex items-stretch gap-2 border-b border-line">
              <button type="button" onClick={() => openDish(d)} className="flex min-h-14 min-w-0 flex-1 items-baseline gap-2 py-3 text-left" data-testid="dish-row">
                <span className="display-face truncate text-xl" lang={d.names[locale] ? locale : "hy"}>
                  {nameFor(d.names, locale)}
                </span>
                <span aria-hidden className="mb-1 min-w-6 flex-1 border-b-2 border-dotted border-line-strong" />
                <span className="num shrink-0 font-semibold">{formatAmd(d.price, locale)}</span>
              </button>
              <span className="flex items-center gap-1 text-xs">
                {LOCALES.map((l) => (
                  <span key={l} title={d.names[l] ? l : `${l}: ${t("languageMissing")}`} className={`rounded-full px-1.5 py-0.5 ${d.names[l] ? "bg-tarragon-tint text-tarragon" : "bg-pom-tint text-pomegranate"}`}>
                    {l}
                  </span>
                ))}
                {d.needsReview && <span className="rounded-full bg-apricot/25 px-2 py-0.5 font-semibold text-apricot-deep">{t("review")}</span>}
                <button type="button" aria-label={t("moveUp")} disabled={pending} onClick={() => move(dishes, d.id, -1, "items")} className="size-8 rounded-chip text-muted hover:bg-mist">
                  ↑
                </button>
                <button type="button" aria-label={t("moveDown")} disabled={pending} onClick={() => move(dishes, d.id, 1, "items")} className="size-8 rounded-chip text-muted hover:bg-mist">
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {panel && (
        <aside
          aria-label={panel.kind === "dish" ? (panel.draft.id ? nameFor(panel.draft.names, locale) : t("newDish")) : t("editCategory")}
          className="fixed inset-0 z-20 overflow-y-auto bg-matsoni p-5 shadow-float lg:static lg:z-auto lg:rounded-sheet lg:border lg:border-line lg:bg-white lg:shadow-none"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {panel.kind === "dish" ? (panel.draft.id ? nameFor(panel.draft.names, locale) : t("newDish")) : panel.draft.id ? t("editCategory") : t("newCategory")}
              </h2>
              <button type="button" onClick={() => setPanel(null)} className="min-h-12 px-3 text-muted">
                {t("close")}
              </button>
            </div>

            {LOCALES.map((l) => (
              <fieldset key={l} className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-muted">
                    {t(`name.${l}`)}
                    {l !== "hy" && !panel.draft.names[l] && <span className="ml-2 text-pomegranate">● {t("languageMissing")}</span>}
                  </span>
                  <input
                    lang={l}
                    value={panel.draft.names[l]}
                    maxLength={panel.kind === "dish" ? 120 : 80}
                    onChange={(e) => {
                      const names = { ...panel.draft.names, [l]: e.target.value };
                      setPanel(panel.kind === "dish" ? { kind: "dish", draft: { ...panel.draft, names } } : { kind: "category", draft: { ...panel.draft, names } });
                    }}
                    className={`${field} h-12`}
                  />
                </label>
                {panel.kind === "dish" && (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted">{t(`description.${l}`)}</span>
                    <textarea
                      lang={l}
                      rows={2}
                      maxLength={600}
                      value={panel.draft.descriptions[l]}
                      onChange={(e) => setPanel({ kind: "dish", draft: { ...panel.draft, descriptions: { ...panel.draft.descriptions, [l]: e.target.value } } })}
                      className={`${field} py-2`}
                    />
                  </label>
                )}
              </fieldset>
            ))}

            {panel.kind === "dish" && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-muted">{t("price")}</span>
                <input
                  inputMode="numeric"
                  value={panel.draft.priceText}
                  onChange={(e) => setPanel({ kind: "dish", draft: { ...panel.draft, priceText: e.target.value } })}
                  className={`${field} num h-12`}
                />
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-muted">{t("prepArea")}</span>
              <select
                value={panel.draft.prepAreaId ?? ""}
                onChange={(e) => {
                  const prepAreaId = e.target.value || null;
                  setPanel(panel.kind === "dish" ? { kind: "dish", draft: { ...panel.draft, prepAreaId } } : { kind: "category", draft: { ...panel.draft, prepAreaId } });
                }}
                className={`${field} h-12`}
              >
                <option value="">{t("prepAreaDefault")}</option>
                {data.prepAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            {panel.kind === "dish" && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-semibold text-muted">{t("optionGroups")}</legend>
                  {data.groups.map((g) => (
                    <label key={g.id} className="flex min-h-12 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-tarragon"
                        checked={panel.draft.modifierGroupIds.includes(g.id)}
                        onChange={(e) => {
                          const ids = e.target.checked ? [...panel.draft.modifierGroupIds, g.id] : panel.draft.modifierGroupIds.filter((x) => x !== g.id);
                          setPanel({ kind: "dish", draft: { ...panel.draft, modifierGroupIds: ids } });
                        }}
                      />
                      {nameFor(g.names, locale)}
                    </label>
                  ))}
                  <Link href="/admin/menu/options" className="text-tarragon underline underline-offset-4">
                    {t("manageOptions")}
                  </Link>
                </fieldset>

                <fieldset className="flex flex-wrap gap-2">
                  <legend className="mb-1 text-sm font-semibold text-muted">{t("tags")}</legend>
                  {DISH_TAGS.map((tag) => {
                    const on = panel.draft.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPanel({ kind: "dish", draft: { ...panel.draft, tags: on ? panel.draft.tags.filter((x) => x !== tag) : [...panel.draft.tags, tag] } })}
                        className={`min-h-10 rounded-full border px-3 ${on ? "border-tarragon bg-tarragon text-white" : "border-line-strong"}`}
                      >
                        {t(`tag.${tag}`)}
                      </button>
                    );
                  })}
                </fieldset>

                {panel.draft.needsReview && (
                  <label className="flex min-h-12 items-center gap-3 rounded-chip bg-apricot/15 px-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-tarragon"
                      checked={panel.draft.markReviewed}
                      onChange={(e) => setPanel({ kind: "dish", draft: { ...panel.draft, markReviewed: e.target.checked } })}
                    />
                    {t("markReviewed")}
                  </label>
                )}
              </>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon px-6 font-semibold text-white disabled:opacity-60">
                {status === "saving" ? t("saving") : t("save")}
              </button>
              {panel.kind === "dish" && panel.draft.id && (
                <button type="button" disabled={pending} onClick={() => remove(panel.draft.id as string)} className="h-12 rounded-input border border-pomegranate px-4 text-pomegranate">
                  {t("delete")}
                </button>
              )}
              <p aria-live="polite" className={status === "saved" ? "text-tarragon" : "text-pomegranate"}>
                {status === "saved" && t("saved")}
                {status === "failed" && t("saveFailed")}
                {status === "priceInvalid" && t("priceInvalid")}
                {status === "nameRequired" && t("nameRequired")}
              </p>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
}

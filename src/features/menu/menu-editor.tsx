"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import { getBrowserClient } from "@/lib/supabase/browser";
import { publicEnv } from "@/lib/env";
import {
  deleteDish,
  publishMenu,
  reorder,
  saveCategory,
  saveDish,
  setDishPhoto,
  setSoldOut,
} from "./actions";
import { resizeToWebp } from "./photo";
import { DISH_TAGS, parsePriceInput } from "./schema";
import { emptyNames, type EditorCategory, type EditorData, type EditorDish, type Names } from "./types";

const LOCALES = ["hy", "ru", "en"] as const;
const field = "w-full rounded-input border border-line-strong bg-white px-3";

type DishDraft = Omit<EditorDish, "id" | "sort" | "needsReview" | "price"> & {
  id?: string;
  priceText: string;
  needsReview: boolean;
  markReviewed: boolean;
};
type CategoryDraft = { id?: string; names: Names; prepAreaId: string | null };
type Panel = { kind: "dish"; draft: DishDraft } | { kind: "category"; draft: CategoryDraft } | null;
type Status = "idle" | "saving" | "saved" | "failed" | "priceInvalid" | "nameRequired";

function photoUrl(path: string): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;
}

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
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "published" | "unreviewed" | "failed"
  >("idle");
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading" | "failed">("idle");

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
            imagePath: null,
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
    open({
      kind: "category",
      draft: c
        ? { id: c.id, names: c.names, prepAreaId: c.prepAreaId }
        : { names: emptyNames(), prepAreaId: null },
    });
  }

  function move<T extends { id: string }>(
    list: T[],
    id: string,
    delta: -1 | 1,
    kind: "categories" | "items",
  ) {
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
        setPanel({
          kind: "dish",
          draft: { ...d, id: result.id, needsReview: d.needsReview && !d.markReviewed },
        });
      }
      setStatus("saved");
      router.refresh();
    });
  }

  function publish() {
    setPublishStatus("publishing");
    startTransition(async () => {
      const result = await publishMenu();
      setPublishStatus(result.ok ? "published" : result.error);
      router.refresh();
    });
  }

  function toggleSoldOut(id: string, soldOut: boolean) {
    startTransition(async () => {
      await setSoldOut(id, soldOut);
      router.refresh();
    });
  }

  async function uploadPhoto(dishId: string, file: File) {
    setPhotoStatus("uploading");
    try {
      const blob = await resizeToWebp(file);
      const path = `${data.restaurantId}/items/${dishId}/${Date.now()}.webp`;
      const { error } = await getBrowserClient()
        .storage.from("menu-images")
        .upload(path, blob, { contentType: "image/webp" });
      if (error || !(await setDishPhoto(dishId, path))) throw error ?? new Error("save failed");
      setPhotoStatus("idle");
      setPanel((p) =>
        p?.kind === "dish" && p.draft.id === dishId
          ? { kind: "dish", draft: { ...p.draft, imagePath: path } }
          : p,
      );
      router.refresh();
    } catch {
      setPhotoStatus("failed");
    }
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
      <section className="rounded-sheet border-line flex flex-col items-start gap-4 border bg-white p-8">
        <h2 className="display-face text-3xl">{t("emptyTitle")}</h2>
        <p className="text-muted">{t("emptyHint")}</p>
        <button
          type="button"
          onClick={() => openCategory()}
          className="rounded-input bg-tarragon h-12 px-6 font-semibold text-white"
        >
          {t("emptyManual")}
        </button>
      </section>
    );
  }

  const banner =
    publishStatus === "published" ? (
      <p role="status" className="rounded-chip bg-tarragon-tint text-tarragon px-4 py-3">
        {t("published")}
      </p>
    ) : data.publish.hasChanges || publishStatus === "unreviewed" || publishStatus === "failed" ? (
      <div role="status" className="rounded-chip bg-apricot/20 flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="flex-1">
          {publishStatus === "unreviewed"
            ? t("unreviewed")
            : publishStatus === "failed"
              ? t("publishFailed")
              : data.publish.published
                ? t("unpublished")
                : t("neverPublished")}
        </p>
        <button
          type="button"
          onClick={publish}
          disabled={pending}
          className="rounded-input bg-tarragon h-12 px-5 font-semibold text-white disabled:opacity-60"
        >
          {publishStatus === "publishing" ? t("publishing") : t("publish")}
        </button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      {banner}
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_minmax(340px,420px)]">
        <nav aria-label={t("categories")} className="flex flex-col gap-1">
          <h2 className="text-muted mb-1 text-sm font-semibold">{t("categories")}</h2>
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
                  className={`rounded-chip min-h-12 flex-1 px-3 text-left ${c.id === selected ? "bg-tarragon text-white" : "hover:bg-mist"}`}
                >
                  {nameFor(c.names, locale)}
                </button>
                <span className="hidden lg:flex">
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    disabled={pending}
                    onClick={() => move(data.categories, c.id, -1, "categories")}
                    className="rounded-chip text-muted hover:bg-mist size-8"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    disabled={pending}
                    onClick={() => move(data.categories, c.id, 1, "categories")}
                    className="rounded-chip text-muted hover:bg-mist size-8"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => openCategory()}
            className="rounded-chip border-line-strong text-tarragon mt-2 min-h-12 border border-dashed px-3 text-left"
          >
            + {t("addCategory")}
          </button>
        </nav>

        <section aria-labelledby="dishes-heading" className="min-w-0">
          {category && (
            <header className="mb-4 flex flex-wrap items-center gap-3">
              <h2 id="dishes-heading" className="display-face text-3xl">
                {nameFor(category.names, locale)}
              </h2>
              <button
                type="button"
                onClick={() => openCategory(category)}
                className="rounded-chip text-tarragon min-h-12 px-3 underline underline-offset-4"
              >
                {t("editCategory")}
              </button>
              <button
                type="button"
                onClick={() => openDish()}
                className="rounded-input bg-tarragon ml-auto h-12 px-5 font-semibold text-white"
              >
                + {t("addDish")}
              </button>
            </header>
          )}
          {category && dishes.length === 0 && <p className="text-muted">{t("emptyCategory")}</p>}
          <ul className="flex flex-col">
            {dishes.map((d) => (
              <li key={d.id} className="border-line flex items-stretch gap-2 border-b">
                <button
                  type="button"
                  onClick={() => openDish(d)}
                  className={`flex min-h-14 min-w-0 flex-1 items-baseline gap-2 py-3 text-left ${data.soldOut.includes(d.id) ? "opacity-50" : ""}`}
                  data-testid="dish-row"
                >
                  <span className="display-face truncate text-xl" lang={d.names[locale] ? locale : "hy"}>
                    {nameFor(d.names, locale)}
                  </span>
                  <span
                    aria-hidden
                    className="border-line-strong mb-1 min-w-6 flex-1 border-b-2 border-dotted"
                  />
                  <span className="num shrink-0 font-semibold">{formatAmd(d.price, locale)}</span>
                </button>
                <span className="flex items-center gap-1 text-xs">
                  {LOCALES.map((l) => (
                    <span
                      key={l}
                      title={d.names[l] ? l : `${l}: ${t("languageMissing")}`}
                      className={`rounded-full px-1.5 py-0.5 ${d.names[l] ? "bg-tarragon-tint text-tarragon" : "bg-pom-tint text-pomegranate"}`}
                    >
                      {l}
                    </span>
                  ))}
                  {d.needsReview && (
                    <span className="bg-apricot/25 text-apricot-deep rounded-full px-2 py-0.5 font-semibold">
                      {t("review")}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={data.soldOut.includes(d.id)}
                    disabled={pending}
                    onClick={() => toggleSoldOut(d.id, !data.soldOut.includes(d.id))}
                    className={`min-h-8 rounded-full border px-2 ${data.soldOut.includes(d.id) ? "border-pomegranate bg-pom-tint text-pomegranate" : "border-line-strong text-muted"}`}
                  >
                    {t("soldOut")}
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    disabled={pending}
                    onClick={() => move(dishes, d.id, -1, "items")}
                    className="rounded-chip text-muted hover:bg-mist size-8"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    disabled={pending}
                    onClick={() => move(dishes, d.id, 1, "items")}
                    className="rounded-chip text-muted hover:bg-mist size-8"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {panel && (
          <aside
            aria-label={
              panel.kind === "dish"
                ? panel.draft.id
                  ? nameFor(panel.draft.names, locale)
                  : t("newDish")
                : t("editCategory")
            }
            className="bg-matsoni shadow-float lg:rounded-sheet lg:border-line fixed inset-0 z-20 overflow-y-auto p-5 lg:static lg:z-auto lg:border lg:bg-white lg:shadow-none"
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
                  {panel.kind === "dish"
                    ? panel.draft.id
                      ? nameFor(panel.draft.names, locale)
                      : t("newDish")
                    : panel.draft.id
                      ? t("editCategory")
                      : t("newCategory")}
                </h2>
                <button type="button" onClick={() => setPanel(null)} className="text-muted min-h-12 px-3">
                  {t("close")}
                </button>
              </div>

              {LOCALES.map((l) => (
                <fieldset key={l} className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted text-sm font-semibold">
                      {t(`name.${l}`)}
                      {l !== "hy" && !panel.draft.names[l] && (
                        <span className="text-pomegranate ml-2">● {t("languageMissing")}</span>
                      )}
                    </span>
                    <input
                      lang={l}
                      value={panel.draft.names[l]}
                      maxLength={panel.kind === "dish" ? 120 : 80}
                      onChange={(e) => {
                        const names = { ...panel.draft.names, [l]: e.target.value };
                        setPanel(
                          panel.kind === "dish"
                            ? { kind: "dish", draft: { ...panel.draft, names } }
                            : { kind: "category", draft: { ...panel.draft, names } },
                        );
                      }}
                      className={`${field} h-12`}
                    />
                  </label>
                  {panel.kind === "dish" && (
                    <label className="flex flex-col gap-1">
                      <span className="text-muted text-sm">{t(`description.${l}`)}</span>
                      <textarea
                        lang={l}
                        rows={2}
                        maxLength={600}
                        value={panel.draft.descriptions[l]}
                        onChange={(e) =>
                          setPanel({
                            kind: "dish",
                            draft: {
                              ...panel.draft,
                              descriptions: { ...panel.draft.descriptions, [l]: e.target.value },
                            },
                          })
                        }
                        className={`${field} py-2`}
                      />
                    </label>
                  )}
                </fieldset>
              ))}

              {panel.kind === "dish" && panel.draft.id && (
                <div className="flex items-center gap-4">
                  {panel.draft.imagePath && (
                    // eslint-disable-next-line @next/next/no-img-element -- already a 600 px WebP from Storage
                    <img
                      src={photoUrl(panel.draft.imagePath)}
                      alt=""
                      width={96}
                      height={72}
                      className="rounded-chip h-18 w-24 object-cover"
                    />
                  )}
                  <label className="rounded-input border-tarragon text-tarragon focus-within:ring-tarragon flex min-h-12 cursor-pointer items-center border px-4 font-semibold focus-within:ring-2 focus-within:ring-offset-2">
                    {photoStatus === "uploading"
                      ? t("uploading")
                      : panel.draft.imagePath
                        ? t("changePhoto")
                        : t("addPhoto")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      data-testid="photo-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && panel.draft.id) void uploadPhoto(panel.draft.id, file);
                      }}
                    />
                  </label>
                  {photoStatus === "failed" && (
                    <p role="alert" className="text-pomegranate">
                      {t("photoFailed")}
                    </p>
                  )}
                </div>
              )}

              {panel.kind === "dish" && (
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-sm font-semibold">{t("price")}</span>
                  <input
                    inputMode="numeric"
                    value={panel.draft.priceText}
                    onChange={(e) =>
                      setPanel({ kind: "dish", draft: { ...panel.draft, priceText: e.target.value } })
                    }
                    className={`${field} num h-12`}
                  />
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-muted text-sm font-semibold">{t("prepArea")}</span>
                <select
                  value={panel.draft.prepAreaId ?? ""}
                  onChange={(e) => {
                    const prepAreaId = e.target.value || null;
                    setPanel(
                      panel.kind === "dish"
                        ? { kind: "dish", draft: { ...panel.draft, prepAreaId } }
                        : { kind: "category", draft: { ...panel.draft, prepAreaId } },
                    );
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
                    <legend className="text-muted text-sm font-semibold">{t("optionGroups")}</legend>
                    {data.groups.map((g) => (
                      <label key={g.id} className="flex min-h-12 items-center gap-3">
                        <input
                          type="checkbox"
                          className="accent-tarragon size-5"
                          checked={panel.draft.modifierGroupIds.includes(g.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...panel.draft.modifierGroupIds, g.id]
                              : panel.draft.modifierGroupIds.filter((x) => x !== g.id);
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
                    <legend className="text-muted mb-1 text-sm font-semibold">{t("tags")}</legend>
                    {DISH_TAGS.map((tag) => {
                      const on = panel.draft.tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPanel({
                              kind: "dish",
                              draft: {
                                ...panel.draft,
                                tags: on
                                  ? panel.draft.tags.filter((x) => x !== tag)
                                  : [...panel.draft.tags, tag],
                              },
                            })
                          }
                          className={`min-h-10 rounded-full border px-3 ${on ? "border-tarragon bg-tarragon text-white" : "border-line-strong"}`}
                        >
                          {t(`tag.${tag}`)}
                        </button>
                      );
                    })}
                  </fieldset>

                  {panel.draft.needsReview && (
                    <label className="rounded-chip bg-apricot/15 flex min-h-12 items-center gap-3 px-3">
                      <input
                        type="checkbox"
                        className="accent-tarragon size-5"
                        checked={panel.draft.markReviewed}
                        onChange={(e) =>
                          setPanel({
                            kind: "dish",
                            draft: { ...panel.draft, markReviewed: e.target.checked },
                          })
                        }
                      />
                      {t("markReviewed")}
                    </label>
                  )}
                </>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-input bg-tarragon h-12 px-6 font-semibold text-white disabled:opacity-60"
                >
                  {status === "saving" ? t("saving") : t("save")}
                </button>
                {panel.kind === "dish" && panel.draft.id && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(panel.draft.id as string)}
                    className="rounded-input border-pomegranate text-pomegranate h-12 border px-4"
                  >
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
    </div>
  );
}

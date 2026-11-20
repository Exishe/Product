"use client";

import { clsx } from "clsx";
import {
  Ban,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  ScanText,
  TriangleAlert,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Notice } from "@/features/admin-ui/page";
import { Sheet, useMediaQuery } from "@/features/admin-ui/sheet";
import { button, check, chip, fieldLabel, field, iconButton, input } from "@/features/admin-ui/styles";
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
import { ALLERGENS, type Allergen } from "./guest-menu/allergens";
import { resizeToWebp } from "./photo";
import { DISH_TAGS, parsePriceInput } from "./schema";
import { emptyNames, type EditorCategory, type EditorData, type EditorDish, type Names } from "./types";

const LOCALES = ["hy", "ru", "en"] as const;
const FORM_ID = "menu-editor-form";

type DishDraft = Omit<EditorDish, "id" | "sort" | "needsReview" | "price"> & {
  id?: string;
  priceText: string;
  costText: string;
  needsReview: boolean;
  markReviewed: boolean;
};
type CategoryDraft = { id?: string; names: Names; prepAreaId: string | null };
type Panel = { kind: "dish"; draft: DishDraft } | { kind: "category"; draft: CategoryDraft } | null;
type Status =
  "idle" | "saving" | "saved" | "failed" | "costFailed" | "priceInvalid" | "costInvalid" | "nameRequired";

// Resizes the photo in the browser, stores it and points the dish at it.
async function storeDishPhoto(restaurantId: string, dishId: string, file: File): Promise<string> {
  const blob = await resizeToWebp(file);
  const path = `${restaurantId}/items/${dishId}/${Date.now()}.webp`;
  const { error } = await getBrowserClient()
    .storage.from("menu-images")
    .upload(path, blob, { contentType: "image/webp" });
  if (error || !(await setDishPhoto(dishId, path))) throw error ?? new Error("save failed");
  return path;
}

function photoUrl(path: string): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;
}

function nameFor(names: Names, locale: Locale): string {
  return names[locale] || names.hy;
}

// The menu editor (ADR-055). From 1024 px: sections on the left, dishes in the
// middle and the editor as an inspector column on the right. Below 1024 px the
// editor is a sheet; after a dish is saved the sheet shrinks to a bar at the
// bottom (saved, add a photo, edit again, close), so the list and "Add dish"
// are free to use at once. A full-screen panel that stayed open after saving
// used to cover the whole list on phones and tablets.
export function MenuEditor({ data }: { data: EditorData }) {
  const t = useTranslations("menu");
  const tAllergen = useTranslations("guest.allergens");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 64rem)");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(data.categories[0]?.id ?? null);
  const [panel, setPanel] = useState<Panel>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "published" | "unreviewed" | "failed"
  >("idle");
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading" | "failed">("idle");
  // Photos added straight from the list, one dish at a time, without opening it.
  const [rowPhoto, setRowPhoto] = useState<Record<string, "uploading" | "failed">>({});

  const category = data.categories.find((c) => c.id === selected) ?? null;
  const dishes = data.dishes.filter((d) => d.categoryId === selected).sort((a, b) => a.sort - b.sort);

  function open(next: Panel) {
    setPanel(next);
    setCollapsed(false);
    setStatus("idle");
  }

  function openDish(d?: EditorDish) {
    open({
      kind: "dish",
      draft: d
        ? {
            ...d,
            priceText: String(d.price),
            costText: d.id in data.costs ? String(data.costs[d.id]) : "",
            markReviewed: false,
          }
        : {
            categoryId: selected as string,
            imagePath: null,
            priceText: "",
            costText: "",
            prepAreaId: null,
            tags: [],
            allergens: [],
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
        const cost = d.costText.trim() === "" ? null : parsePriceInput(d.costText);
        if (data.isOwner && d.costText.trim() !== "" && cost === null) return setStatus("costInvalid");
        const result = await saveDish({
          id: d.id,
          categoryId: d.categoryId,
          price,
          names: d.names,
          descriptions: d.descriptions,
          prepAreaId: d.prepAreaId,
          tags: d.tags as (typeof DISH_TAGS)[number][],
          allergens: d.allergens as Allergen[],
          modifierGroupIds: d.modifierGroupIds,
          markReviewed: d.markReviewed,
          // Only when it changed: the cost lives in its own owner-only table.
          ...(data.isOwner && cost !== (d.id && d.id in data.costs ? data.costs[d.id] : null)
            ? { cost }
            : {}),
        });
        if (!result.ok) return setStatus("failed");
        setPanel({
          kind: "dish",
          draft: { ...d, id: result.id, needsReview: d.needsReview && !d.markReviewed },
        });
        // The dish is saved; keep the sheet open so the cost can be retried.
        if (!result.costSaved) {
          setStatus("costFailed");
          return router.refresh();
        }
        // On a phone or tablet the sheet steps aside; the inspector stays.
        setCollapsed(true);
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
      const path = await storeDishPhoto(data.restaurantId, dishId, file);
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

  async function quickPhoto(dishId: string, file: File) {
    setRowPhoto((r) => ({ ...r, [dishId]: "uploading" }));
    try {
      await storeDishPhoto(data.restaurantId, dishId, file);
      setRowPhoto((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== dishId)));
      router.refresh();
    } catch {
      setRowPhoto((r) => ({ ...r, [dishId]: "failed" }));
    }
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteDish(id);
      setPanel(null);
      router.refresh();
    });
  }

  const bar = panel?.kind === "dish" && collapsed && !wide;
  // Escape closes the saved bar, as it closes the sheet.
  useEffect(() => {
    if (!bar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bar]);

  if (data.categories.length === 0 && panel === null) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-2xl bg-white p-6 sm:p-8">
        <span className="bg-staff-fill text-ink grid size-12 place-items-center rounded-2xl">
          <BookOpen aria-hidden="true" className="size-6" />
        </span>
        <h2 className="m-0 text-[1.75rem] leading-tight font-bold">{t("emptyTitle")}</h2>
        <p className="text-staff-label2 m-0 max-w-prose text-[1.0625rem]">{t("emptyHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/menu/import" className={button("primary")}>
            <ScanText aria-hidden="true" />
            {t("emptyPhoto")}
          </Link>
          <button type="button" onClick={() => openCategory()} className={button("secondary")}>
            <Pencil aria-hidden="true" />
            {t("emptyManual")}
          </button>
        </div>
      </section>
    );
  }

  const banner =
    publishStatus === "published" ? (
      <Notice tone="ok" role="status" icon={<CircleCheck aria-hidden="true" />}>
        <p className="m-0">{t("published")}</p>
      </Notice>
    ) : data.publish.hasChanges || publishStatus === "unreviewed" || publishStatus === "failed" ? (
      <Notice
        tone={publishStatus === "failed" ? "alert" : "wait"}
        role="status"
        icon={
          publishStatus === "failed" ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <TriangleAlert aria-hidden="true" />
          )
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 min-w-0 flex-1 basis-56">
            {publishStatus === "unreviewed"
              ? t("unreviewed")
              : publishStatus === "failed"
                ? t("publishFailed")
                : data.publish.published
                  ? t("unpublished")
                  : t("neverPublished")}
          </p>
          <button type="button" onClick={publish} disabled={pending} className={button("primary")}>
            {publishStatus === "publishing" ? t("publishing") : t("publish")}
          </button>
        </div>
      </Notice>
    ) : null;

  const panelTitle = panel
    ? panel.kind === "dish"
      ? panel.draft.id
        ? nameFor(panel.draft.names, locale) || t("newDish")
        : t("newDish")
      : panel.draft.id
        ? t("editCategory")
        : t("newCategory")
    : "";

  const message = (
    <p
      aria-live="polite"
      className={clsx(
        "m-0 text-[0.9375rem] font-semibold",
        status === "saved" ? "text-tarragon" : "text-pomegranate",
      )}
    >
      {status === "saved" && t("saved")}
      {status === "failed" && t("saveFailed")}
      {status === "priceInvalid" && t("priceInvalid")}
      {status === "costInvalid" && t("costInvalid")}
      {status === "costFailed" && t("costFailed")}
      {status === "nameRequired" && t("nameRequired")}
    </p>
  );

  const actions = panel && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="submit"
        form={FORM_ID}
        disabled={pending}
        className={button("primary", "min-w-32 flex-1 sm:flex-none")}
      >
        {status === "saving" ? t("saving") : t("save")}
      </button>
      {panel.kind === "dish" && panel.draft.id && (
        <button
          type="button"
          disabled={pending}
          onClick={() => remove(panel.draft.id as string)}
          className={button("danger")}
        >
          {t("delete")}
        </button>
      )}
      <div className="basis-full">{message}</div>
    </div>
  );

  const photo =
    panel?.kind === "dish" && panel.draft.id ? (
      <PhotoPicker
        path={panel.draft.imagePath}
        status={photoStatus}
        onPick={(file) => panel.draft.id && void uploadPhoto(panel.draft.id, file)}
      />
    ) : null;

  const form = panel && (
    <form
      id={FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <Group title={t(panel.kind === "dish" ? "namesDish" : "namesSection")}>
        {LOCALES.map((l) => (
          <div key={l} className="border-staff-sep flex flex-col gap-3 border-b pb-4 last:border-0 last:pb-0">
            <label className="flex flex-col gap-1.5">
              <span className={clsx(fieldLabel, "flex flex-wrap items-center gap-x-2")}>
                {t(`name.${l}`)}
                {l !== "hy" && !panel.draft.names[l] && (
                  <span className="text-pomegranate inline-flex items-center gap-1">
                    <CircleAlert aria-hidden="true" className="size-4" />
                    {t("languageMissing")}
                  </span>
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
                className={input}
              />
            </label>
            {panel.kind === "dish" && (
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabel}>{t(`description.${l}`)}</span>
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
                  className={clsx(field, "py-2.5")}
                />
              </label>
            )}
          </div>
        ))}
      </Group>

      {panel.kind === "dish" && (
        <Group title={t("photo")}>
          {photo ?? <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("photoAfterSave")}</p>}
        </Group>
      )}

      <Group title={panel.kind === "dish" ? t("priceAndKitchen") : t("prepArea")}>
        {panel.kind === "dish" && (
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("price")}</span>
            <input
              inputMode="numeric"
              value={panel.draft.priceText}
              onChange={(e) =>
                setPanel({ kind: "dish", draft: { ...panel.draft, priceText: e.target.value } })
              }
              className={clsx(input, "num")}
            />
          </label>
        )}
        {panel.kind === "dish" && data.isOwner && (
          <CostField
            costText={panel.draft.costText}
            priceText={panel.draft.priceText}
            onChange={(costText) => setPanel({ kind: "dish", draft: { ...panel.draft, costText } })}
          />
        )}
        <label className="flex flex-col gap-1.5">
          <span className={panel.kind === "dish" ? fieldLabel : "sr-only"}>{t("prepArea")}</span>
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
            className={input}
          >
            <option value="">{t("prepAreaDefault")}</option>
            {data.prepAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </Group>

      {panel.kind === "dish" && (
        <>
          <fieldset className="m-0 flex min-w-0 flex-col gap-1 rounded-2xl border-0 bg-white p-4">
            <legend className="float-left mb-1 w-full text-[0.9375rem] font-bold">{t("optionGroups")}</legend>
            {data.groups.map((g) => (
              <label key={g.id} className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
                <input
                  type="checkbox"
                  className={check}
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
            <Link href="/admin/menu/options" className={button("plain", "self-start")}>
              {t("manageOptions")}
            </Link>
          </fieldset>

          <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 rounded-2xl border-0 bg-white p-4">
            <legend className="float-left mb-1 w-full text-[0.9375rem] font-bold">{t("tags")}</legend>
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
                        tags: on ? panel.draft.tags.filter((x) => x !== tag) : [...panel.draft.tags, tag],
                      },
                    })
                  }
                  className={clsx(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-semibold",
                    on ? "bg-ink text-white" : "bg-staff-fill text-ink",
                  )}
                >
                  {on && <Check aria-hidden="true" className="size-4" />}
                  {t(`tag.${tag}`)}
                </button>
              );
            })}
          </fieldset>

          <fieldset
            className="m-0 flex min-w-0 flex-wrap gap-2 rounded-2xl border-0 bg-white p-4"
            data-testid="allergens"
          >
            <legend className="float-left mb-1 w-full text-[0.9375rem] font-bold">{t("allergens")}</legend>
            <p className="text-staff-label2 m-0 mb-1 w-full text-[0.9375rem]">{t("allergensHint")}</p>
            {ALLERGENS.map((a) => {
              const on = panel.draft.allergens.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPanel({
                      kind: "dish",
                      draft: {
                        ...panel.draft,
                        allergens: on
                          ? panel.draft.allergens.filter((x) => x !== a)
                          : [...panel.draft.allergens, a],
                      },
                    })
                  }
                  className={clsx(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-semibold",
                    on ? "bg-ink text-white" : "bg-staff-fill text-ink",
                  )}
                >
                  {on && <Check aria-hidden="true" className="size-4" />}
                  {tAllergen(a)}
                </button>
              );
            })}
          </fieldset>

          {panel.draft.needsReview && (
            <label className="bg-amber-tint flex min-h-12 items-center gap-3 rounded-2xl px-4 py-2 text-[1.0625rem]">
              <input
                type="checkbox"
                className={check}
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
    </form>
  );

  return (
    <div className={clsx("flex flex-col gap-5", bar && "pb-48")}>
      {banner}
      <div
        className={clsx(
          "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5",
          panel && wide
            ? "lg:grid-cols-[13rem_minmax(0,1fr)_minmax(22rem,26rem)]"
            : "lg:grid-cols-[15rem_minmax(0,1fr)]",
        )}
      >
        <nav aria-label={t("categories")} className="flex min-w-0 flex-col gap-2 lg:self-start">
          <h2 className="m-0 px-1 text-[1.1875rem] leading-tight font-semibold">{t("categories")}</h2>
          <ul className="relative flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-2xl lg:bg-white lg:p-2">
            {data.categories.map((c) => {
              const current = c.id === selected;
              return (
                <li key={c.id} className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c.id);
                      setPanel(null);
                    }}
                    aria-current={current ? "true" : undefined}
                    className={clsx(
                      "min-h-11 flex-1 rounded-full px-4 text-left text-[0.9375rem] font-semibold whitespace-nowrap lg:rounded-[0.625rem] lg:px-3 lg:whitespace-normal",
                      current ? "bg-ink text-white lg:font-bold" : "text-ink bg-white lg:bg-transparent",
                    )}
                  >
                    {nameFor(c.names, locale)}
                  </button>
                  <span className="hidden lg:flex">
                    <button
                      type="button"
                      aria-label={t("moveUp")}
                      disabled={pending}
                      onClick={() => move(data.categories, c.id, -1, "categories")}
                      className={iconButton("size-9")}
                    >
                      <ChevronUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("moveDown")}
                      disabled={pending}
                      onClick={() => move(data.categories, c.id, 1, "categories")}
                      className={iconButton("size-9")}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
            <li className="flex shrink-0">
              <button
                type="button"
                onClick={() => openCategory()}
                className="border-staff-field text-ink inline-flex min-h-11 flex-1 items-center gap-2 rounded-full border border-dashed px-4 text-[0.9375rem] font-semibold whitespace-nowrap lg:rounded-[0.625rem] lg:border-0 lg:px-3"
              >
                <Plus aria-hidden="true" className="size-[1.125rem]" />
                <span className="sr-only">+ </span>
                {t("addCategory")}
              </button>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="dishes-heading" className="flex min-w-0 flex-col gap-3">
          {category && (
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2
                id="dishes-heading"
                className="m-0 min-w-0 flex-1 basis-48 text-[1.5rem] leading-tight font-bold break-words"
              >
                {nameFor(category.names, locale)}
              </h2>
              <button
                type="button"
                onClick={() => openCategory(category)}
                className={button("secondary", "min-h-11 text-[0.9375rem]")}
              >
                <Pencil aria-hidden="true" className="!size-4" />
                {t("editCategory")}
              </button>
              <button
                type="button"
                onClick={() => openDish()}
                className={button("primary", "min-h-11 text-[0.9375rem]")}
              >
                <Plus aria-hidden="true" />
                <span className="sr-only">+ </span>
                {t("addDish")}
              </button>
            </header>
          )}
          {category && dishes.length === 0 && (
            <p className="text-staff-label2 m-0 flex items-center gap-3 rounded-2xl bg-white px-4 py-6 text-[1.0625rem]">
              <UtensilsCrossed aria-hidden="true" className="size-5 shrink-0" />
              {t("emptyCategory")}
            </p>
          )}
          {dishes.length > 0 && (
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl bg-white p-0">
              {dishes.map((d) => {
                const soldOut = data.soldOut.includes(d.id);
                const editing = panel?.kind === "dish" && panel.draft.id === d.id;
                return (
                  <li
                    key={d.id}
                    className={clsx(
                      "border-staff-sep flex flex-col gap-1 border-b px-3 py-2 last:border-0 sm:px-4",
                      editing && "bg-staff-fill/60",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {d.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element -- already a 600 px WebP from Storage
                        <img
                          src={photoUrl(d.imagePath)}
                          alt=""
                          width={44}
                          height={44}
                          className="size-11 shrink-0 rounded-[0.625rem] object-cover"
                        />
                      ) : (
                        <QuickPhoto
                          name={nameFor(d.names, locale)}
                          status={rowPhoto[d.id]}
                          onPick={(file) => void quickPhoto(d.id, file)}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => openDish(d)}
                        className={clsx(
                          "flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl text-left",
                          soldOut ? "text-staff-label2" : "text-ink",
                        )}
                        data-testid="dish-row"
                      >
                        <span
                          className="min-w-0 flex-1 text-[1.0625rem] leading-snug font-semibold break-words"
                          lang={d.names[locale] ? locale : "hy"}
                        >
                          {nameFor(d.names, locale)}
                        </span>
                        <span className="num shrink-0 text-[1.0625rem] font-semibold">
                          {formatAmd(d.price, locale)}
                        </span>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:pl-14">
                      {LOCALES.map((l) =>
                        d.names[l] ? (
                          <span key={l} title={l} className={clsx(chip.base, chip.plain)}>
                            {l}
                          </span>
                        ) : (
                          <span
                            key={l}
                            title={`${l}: ${t("languageMissing")}`}
                            className={clsx(chip.base, chip.alert)}
                          >
                            <CircleAlert aria-hidden="true" />
                            {l}
                            <span className="sr-only">: {t("languageMissing")}</span>
                          </span>
                        ),
                      )}
                      {d.needsReview && (
                        <span className={clsx(chip.base, chip.wait)}>
                          <TriangleAlert aria-hidden="true" />
                          {t("review")}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-pressed={soldOut}
                          disabled={pending}
                          onClick={() => toggleSoldOut(d.id, !soldOut)}
                          className={clsx(
                            "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-semibold",
                            soldOut ? "bg-pom-tint text-pomegranate" : "text-staff-label2",
                          )}
                        >
                          <Ban aria-hidden="true" className="size-4" />
                          {t("soldOut")}
                        </button>
                        <button
                          type="button"
                          aria-label={t("moveUp")}
                          disabled={pending}
                          onClick={() => move(dishes, d.id, -1, "items")}
                          className={iconButton()}
                        >
                          <ChevronUp aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("moveDown")}
                          disabled={pending}
                          onClick={() => move(dishes, d.id, 1, "items")}
                          className={iconButton()}
                        >
                          <ChevronDown aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {panel && wide && (
          <aside
            aria-label={panelTitle}
            className="admin-fade bg-staff-fill/60 ring-staff-sep flex min-w-0 flex-col self-start overflow-hidden rounded-2xl ring-1 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8.5rem)]"
          >
            <header className="border-staff-sep flex min-h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
              <h2 className="m-0 min-w-0 flex-1 truncate text-[1.0625rem] font-bold">{panelTitle}</h2>
              <button
                type="button"
                onClick={() => setPanel(null)}
                aria-label={t("close")}
                className="bg-staff-fill text-staff-label2 inline-grid size-11 shrink-0 place-items-center rounded-full"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{form}</div>
            <footer className="border-staff-sep shrink-0 border-t bg-white px-4 py-3">{actions}</footer>
          </aside>
        )}
      </div>

      {panel && !wide && !bar && (
        <Sheet title={panelTitle} closeLabel={t("close")} onClose={() => setPanel(null)} footer={actions}>
          {form}
        </Sheet>
      )}

      {bar && panel.kind === "dish" && (
        <div
          role="region"
          aria-label={panelTitle}
          className="admin-rise shadow-float ring-staff-sep fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-white p-3 ring-1"
        >
          <div className="flex items-center gap-2">
            <CircleCheck aria-hidden="true" className="text-tarragon size-6 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              {message}
              <span className="truncate text-[1.0625rem] font-semibold">{panelTitle}</span>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className={button("secondary", "min-h-11 px-3 text-[0.9375rem]")}
            >
              <Pencil aria-hidden="true" className="!size-4" />
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={t("close")}
              className="bg-staff-fill text-staff-label2 inline-grid size-11 shrink-0 place-items-center rounded-full"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          {photo}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4">
      <h3 className="m-0 text-[0.9375rem] font-bold">{title}</h3>
      {children}
    </div>
  );
}

// The dish photo: a thumbnail and a button-like label around the file input.
function PhotoPicker({
  path,
  status,
  onPick,
}: {
  path: string | null;
  status: "idle" | "uploading" | "failed";
  onPick: (file: File) => void;
}) {
  const t = useTranslations("menu");
  return (
    <div className="flex flex-wrap items-center gap-3">
      {path && (
        // eslint-disable-next-line @next/next/no-img-element -- already a 600 px WebP from Storage
        <img
          src={photoUrl(path)}
          alt=""
          width={64}
          height={48}
          className="h-12 w-16 rounded-[0.625rem] object-cover"
        />
      )}
      <label
        className={button(
          "tinted",
          "has-[:focus-visible]:outline-ink min-h-11 cursor-pointer text-[0.9375rem] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
        )}
      >
        <ImagePlus aria-hidden="true" />
        {status === "uploading" ? t("uploading") : path ? t("changePhoto") : t("addPhoto")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          data-testid="photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
          }}
        />
      </label>
      {status === "failed" && (
        <p
          role="alert"
          className="text-pomegranate m-0 flex items-center gap-1.5 text-[0.9375rem] font-semibold"
        >
          <CircleAlert aria-hidden="true" className="size-4" />
          {t("photoFailed")}
        </p>
      )}
    </div>
  );
}

// The empty photo slot in a dish row: a dashed square that opens the file
// picker, so an owner can go down the list adding photos without opening
// each dish.
function QuickPhoto({
  name,
  status,
  onPick,
}: {
  name: string;
  status?: "uploading" | "failed";
  onPick: (file: File) => void;
}) {
  const t = useTranslations("menu");
  const label =
    status === "uploading"
      ? t("uploading")
      : status === "failed"
        ? t("photoFailed")
        : t("addPhotoFor", { name });
  return (
    <label
      title={label}
      className={clsx(
        "has-[:focus-visible]:outline-ink grid size-11 shrink-0 cursor-pointer place-items-center rounded-[0.625rem] border border-dashed has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
        status === "failed"
          ? "border-pomegranate bg-pom-tint text-pomegranate"
          : "border-staff-field text-staff-label2 hover:border-ink hover:text-ink",
      )}
      data-testid="quick-photo"
    >
      {status === "uploading" ? (
        <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />
      ) : status === "failed" ? (
        <CircleAlert aria-hidden="true" className="size-5" />
      ) : (
        <ImagePlus aria-hidden="true" className="size-5" />
      )}
      <span className="sr-only" role={status === "failed" ? "alert" : undefined}>
        {label}
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={status === "uploading"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </label>
  );
}

// The owner's cost price for a dish (ingredients per portion), with the
// margin it leaves. Only the owner sees it; the menu analysis uses it.
function CostField({
  costText,
  priceText,
  onChange,
}: {
  costText: string;
  priceText: string;
  onChange: (costText: string) => void;
}) {
  const t = useTranslations("menu");
  const locale = useLocale() as Locale;
  const price = parsePriceInput(priceText);
  const cost = costText.trim() === "" ? null : parsePriceInput(costText);
  const margin = price !== null && cost !== null && price > 0 ? price - cost : null;
  return (
    <label className="flex flex-col gap-1.5">
      <span className={fieldLabel}>{t("cost")}</span>
      <input
        inputMode="numeric"
        value={costText}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby="cost-hint"
        className={clsx(input, "num")}
        data-testid="cost-input"
      />
      <span id="cost-hint" className="text-staff-label2 num text-[0.9375rem]">
        {margin !== null && price
          ? t("margin", { amount: formatAmd(margin, locale), pct: Math.round((margin / price) * 100) })
          : t("costHint")}
      </span>
    </label>
  );
}

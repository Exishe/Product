"use client";

import { clsx } from "clsx";
import {
  Ban,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  EyeOff,
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
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Notice } from "@/features/admin-ui/page";
import { Sheet, useMediaQuery } from "@/features/admin-ui/sheet";
import { button, check, chip, fieldLabel, field, input, textAction } from "@/features/admin-ui/styles";
import { useToast } from "@/features/admin-ui/toast";
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
import { saveCategoryWindow } from "@/features/availability/actions";
import { inDailyWindow, localMinutes, validWindow } from "@/features/availability/window";
import { ALLERGENS, type Allergen } from "./guest-menu/allergens";
import { IngredientsPanel } from "./ingredients-panel";
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
type CategoryDraft = {
  id?: string;
  names: Names;
  prepAreaId: string | null;
  isActive: boolean;
  /** Only at certain hours (ADR-068); `from`/`to` are "HH:MM". */
  limited: boolean;
  from: string;
  to: string;
};
type Panel = { kind: "dish"; draft: DishDraft } | { kind: "category"; draft: CategoryDraft } | null;
type Status =
  | "idle"
  | "saving"
  | "saved"
  | "failed"
  | "costFailed"
  | "priceInvalid"
  | "costInvalid"
  | "nameRequired"
  | "windowInvalid"
  | "windowFailed"
  | "deleteFailed";

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

// The menu editor (ADR-055). From 1280 px: sections on the left, dishes in the
// middle and the editor as an inspector column on the right. Below 1280 px the
// editor is a sheet (at 1024 px three columns left the dish list 280 px wide); after a dish is saved the sheet shrinks to a bar at the
// bottom (saved, add a photo, edit again, close), so the list and "Add dish"
// are free to use at once. A full-screen panel that stayed open after saving
// used to cover the whole list on phones and tablets.
export function MenuEditor({ data }: { data: EditorData }) {
  const t = useTranslations("menu");
  const tAllergen = useTranslations("guest.allergens");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 80rem)");
  const toast = useToast();
  const inspector = useRef<HTMLElement>(null);
  // Three columns (sections, dishes, panel) need a big screen; on a laptop the
  // section list steps aside while the panel is open, so dish names keep room.
  const roomy = useMediaQuery("(min-width: 100rem)");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(data.categories[0]?.id ?? null);
  const [panel, setPanel] = useState<Panel>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  // Deleting a dish asks once more, inline, before it happens.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "published" | "unreviewed" | "failed"
  >("idle");
  // "Not today" as the owner just set it, before the refreshed list arrives.
  const [soldOverride, setSoldOverride] = useState<Record<string, boolean>>({});
  // Owner-facing filter: only dishes whose allergens nobody has reviewed yet (ADR-083).
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading" | "failed">("idle");
  const [translationsOpen, setTranslationsOpen] = useState(false);
  // Photos added straight from the list, one dish at a time, without opening it.
  const [rowPhoto, setRowPhoto] = useState<Record<string, "uploading" | "failed">>({});

  const category = data.categories.find((c) => c.id === selected) ?? null;
  const dishes = data.dishes.filter((d) => d.categoryId === selected).sort((a, b) => a.sort - b.sort);
  const unreviewedCount = dishes.filter((d) => !d.allergensConfirmed).length;
  const shownDishes = onlyUnreviewed ? dishes.filter((d) => !d.allergensConfirmed) : dishes;

  function open(next: Panel) {
    setPanel(next);
    setTranslationsOpen(false);
    setCollapsed(false);
    setStatus("idle");
    setConfirmingDelete(false);
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
            allergensConfirmed: false,
            names: emptyNames(),
            descriptions: emptyNames(),
            modifierGroupIds: [],
            needsReview: false,
            isActive: true,
            markReviewed: false,
          },
    });
  }

  function openCategory(c?: EditorCategory) {
    open({
      kind: "category",
      draft: c
        ? {
            id: c.id,
            names: c.names,
            prepAreaId: c.prepAreaId,
            isActive: c.isActive,
            limited: c.window !== null,
            from: c.window?.from ?? "08:00",
            to: c.window?.to ?? "12:00",
          }
        : {
            names: emptyNames(),
            prepAreaId: null,
            isActive: true,
            limited: false,
            from: "08:00",
            to: "12:00",
          },
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
        const d = panel.draft;
        const before = d.id ? (data.categories.find((c) => c.id === d.id)?.window ?? null) : null;
        const next = d.limited ? { from: d.from, to: d.to } : null;
        const windowChanged = before?.from !== next?.from || before?.to !== next?.to;
        if (data.windowsSupported && d.limited && !validWindow(d.from, d.to))
          return setStatus("windowInvalid");
        const result = await saveCategory({
          id: d.id,
          names: d.names,
          prepAreaId: d.prepAreaId,
          isActive: d.isActive,
        });
        if (!result.ok) return setStatus("failed");
        if (data.windowsSupported && windowChanged) {
          const saved = await saveCategoryWindow(result.id, next?.from ?? null, next?.to ?? null);
          if (!saved) {
            setSelected(result.id);
            // The section exists now: the next Save must update it, not add a second one.
            setPanel({ kind: "category", draft: { ...d, id: result.id } });
            return setStatus("windowFailed");
          }
        }
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
          ...(data.allergenReviewSupported ? { allergensConfirmed: d.allergensConfirmed } : {}),
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

  // Hiding is saved with the dish; the guest menu changes at the next publish.
  function toggleDishActive(d: EditorDish, undo = true) {
    const name = nameFor(d.names, locale);
    startTransition(async () => {
      const result = await saveDish({
        id: d.id,
        categoryId: d.categoryId,
        price: d.price,
        names: d.names,
        descriptions: d.descriptions,
        prepAreaId: d.prepAreaId,
        tags: d.tags as (typeof DISH_TAGS)[number][],
        allergens: d.allergens as Allergen[],
        // The list is sent, so the review flag must go with it (an empty list alone would reset it).
        ...(data.allergenReviewSupported ? { allergensConfirmed: d.allergensConfirmed } : {}),
        modifierGroupIds: d.modifierGroupIds,
        markReviewed: false,
        isActive: !d.isActive,
      });
      if (!result.ok) return toast(t("toggleFailed"), "error");
      if (undo)
        toast(t(d.isActive ? "hiddenToast" : "shownToast", { name }), "ok", {
          label: t("undo"),
          run: () => toggleDishActive({ ...d, isActive: !d.isActive }, false),
        });
      router.refresh();
    });
  }

  // "Not today" reaches the guest menu at once (the stop list), so it says so
  // and offers Undo for 5 s; a failed save says so too, instead of nothing.
  function toggleSoldOut(d: EditorDish, soldOut: boolean, undo = true) {
    const name = nameFor(d.names, locale);
    setSoldOverride((o) => ({ ...o, [d.id]: soldOut }));
    startTransition(async () => {
      if (!(await setSoldOut(d.id, soldOut))) {
        setSoldOverride((o) => ({ ...o, [d.id]: !soldOut }));
        return toast(t("toggleFailed"), "error");
      }
      if (undo)
        toast(t(soldOut ? "soldOutToast" : "backToast", { name }), "ok", {
          label: t("undo"),
          run: () => toggleSoldOut(d, !soldOut, false),
        });
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
    setConfirmingDelete(false);
    startTransition(async () => {
      // The dish is still there: keep it open and say so.
      if (!(await deleteDish(id))) return setStatus("deleteFailed");
      setPanel(null);
      router.refresh();
    });
  }

  const bar = panel?.kind === "dish" && collapsed && !wide;
  const panelKey = panel ? `${panel.kind}:${panel.draft.id ?? "new"}` : null;
  // A newly opened inspector starts at the top of the screen, so its pinned
  // Save is visible (it opened under the page header, Save below the fold).
  useEffect(() => {
    if (!panelKey || !wide) return;
    const top = inspector.current?.getBoundingClientRect().top ?? 0;
    if (top > 24) window.scrollBy({ top: top - 16 });
  }, [panelKey, wide]);
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
      <section className="flex flex-col items-start gap-4 py-4">
        <span className="bg-staff-fill text-ink grid size-12 place-items-center rounded-2xl">
          <BookOpen aria-hidden="true" className="size-6" />
        </span>
        <h2 className="m-0 text-[1.75rem] leading-tight font-bold">{t("emptyTitle")}</h2>
        <p className="text-staff-label2 m-0 max-w-prose text-name">{t("emptyHint")}</p>
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
        "m-0 text-label font-semibold",
        status === "saved" ? "text-tarragon" : "text-pomegranate",
      )}
    >
      {status === "saved" && t("saved")}
      {status === "failed" && t("saveFailed")}
      {status === "priceInvalid" && t("priceInvalid")}
      {status === "costInvalid" && t("costInvalid")}
      {status === "costFailed" && t("costFailed")}
      {status === "nameRequired" && t("nameRequired")}
      {status === "windowInvalid" && t("windowInvalid")}
      {status === "windowFailed" && t("windowFailed")}
      {status === "deleteFailed" && t("deleteFailed")}
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
          aria-expanded={confirmingDelete}
          onClick={() => setConfirmingDelete(true)}
          className={textAction("danger", "ml-auto")}
        >
          {t("delete")}
        </button>
      )}
      {panel.kind === "dish" && panel.draft.id && confirmingDelete && (
        <div role="group" className="flex basis-full flex-wrap items-center gap-2">
          <p className="m-0 flex-1 basis-48 text-name">{t("deleteConfirm")}</p>
          <button
            type="button"
            data-testid="dish-delete-yes"
            disabled={pending}
            onClick={() => remove(panel.draft.id as string)}
            className={button("destructive", "flex-1 sm:flex-none")}
          >
            {t("deleteYes")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingDelete(false)}
            className={button("secondary", "flex-1 sm:flex-none")}
          >
            {t("deleteNo")}
          </button>
        </div>
      )}
      <div className="basis-full">{message}</div>
    </div>
  );

  // The dish as saved: show-on-menu and the order act on it at once.
  const savedDish =
    panel?.kind === "dish" && panel.draft.id ? (data.dishes.find((x) => x.id === panel.draft.id) ?? null) : null;

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
      className="flex flex-col gap-8"
    >
      {panel.kind === "dish" && (
        <Group title={t("photoAndPrice")}>
          {photo ?? <p className="text-staff-label2 m-0 text-label">{t("photoAfterSave")}</p>}
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("price")}</span>
            <input
              inputMode="numeric"
              value={panel.draft.priceText}
              onChange={(e) =>
                setPanel({ kind: "dish", draft: { ...panel.draft, priceText: e.target.value } })
              }
              className={clsx(input, "num max-w-56 text-heading font-semibold")}
            />
          </label>
          {data.isOwner && (
            <CostField
              costText={panel.draft.costText}
              priceText={panel.draft.priceText}
              onChange={(costText) => setPanel({ kind: "dish", draft: { ...panel.draft, costText } })}
            />
          )}
        </Group>
      )}

      <Group title={t(panel.kind === "dish" ? "namesDish" : "namesSection")}>
        <NameFields
          l="hy"
          panel={panel}
          onNames={(names) =>
            setPanel(
              panel.kind === "dish"
                ? { kind: "dish", draft: { ...panel.draft, names } }
                : { kind: "category", draft: { ...panel.draft, names } },
            )
          }
          onDescriptions={(descriptions) =>
            panel.kind === "dish" && setPanel({ kind: "dish", draft: { ...panel.draft, descriptions } })
          }
        />
        {/* Russian and English fold away; the summary says when one is missing. */}
        <details className="group border-staff-sep border-t" open={translationsOpen}>
          <summary
            onClick={(e) => {
              e.preventDefault();
              setTranslationsOpen((v) => !v);
            }}
            className="flex min-h-12 cursor-pointer list-none items-center gap-2 pt-2 [&::-webkit-details-marker]:hidden"
          >
            <span className="text-name font-semibold">{t("translations")}</span>
            {(["ru", "en"] as const).some((l) => !panel.draft.names[l]) && (
              <span className="text-amber-text inline-flex items-center gap-1.5 text-label font-semibold">
                <span aria-hidden="true" className="bg-amber-text size-2 rounded-full" />
                {t("translationsMissing")}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className="text-staff-label2 ml-auto size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="flex flex-col gap-4 pt-2 pb-1">
            {(["ru", "en"] as const).map((l) => (
              <NameFields
                key={l}
                l={l}
                panel={panel}
                onNames={(names) =>
                  setPanel(
                    panel.kind === "dish"
                      ? { kind: "dish", draft: { ...panel.draft, names } }
                      : { kind: "category", draft: { ...panel.draft, names } },
                  )
                }
                onDescriptions={(descriptions) =>
                  panel.kind === "dish" && setPanel({ kind: "dish", draft: { ...panel.draft, descriptions } })
                }
              />
            ))}
          </div>
        </details>
      </Group>

      <Group title={t("prepArea")}>
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">{t("prepArea")}</span>
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

      {panel.kind === "dish" && savedDish && (
        <Group title={t("onMenu")}>
          <button
            type="button"
            role="switch"
            aria-checked={savedDish.isActive}
            disabled={pending}
            onClick={() => toggleDishActive(savedDish)}
            className="flex min-h-12 items-center gap-3 text-left text-name disabled:opacity-60"
          >
            <Switch on={savedDish.isActive} />
            {t("shownOnMenu")}
          </button>
          <p className="text-staff-label2 m-0 text-label">{t("shownOnMenuHint")}</p>
          <div className="border-staff-sep flex flex-wrap items-center gap-x-2 border-t pt-3">
            <span className="text-staff-label2 mr-auto text-label">{t("positionDish")}</span>
            <button
              type="button"
              disabled={pending || dishes[0]?.id === savedDish.id}
              onClick={() => move(dishes, savedDish.id, -1, "items")}
              className={textAction("ink")}
            >
              <ChevronUp aria-hidden="true" />
              {t("dishUp")}
            </button>
            <button
              type="button"
              disabled={pending || dishes[dishes.length - 1]?.id === savedDish.id}
              onClick={() => move(dishes, savedDish.id, 1, "items")}
              className={textAction("ink")}
            >
              <ChevronDown aria-hidden="true" />
              {t("dishDown")}
            </button>
          </div>
        </Group>
      )}

      {panel.kind === "category" && (
        <Group title={t("sectionShown")}>
          <label className="flex min-h-12 items-center gap-3 text-name">
            <input
              type="checkbox"
              className={check}
              checked={panel.draft.isActive}
              onChange={(e) =>
                setPanel({ kind: "category", draft: { ...panel.draft, isActive: e.target.checked } })
              }
            />
            {t("sectionShownToggle")}
          </label>
          <p className="text-staff-label2 m-0 text-label">{t("sectionShownHint")}</p>
        </Group>
      )}

      {panel.kind === "category" && panel.draft.id && (
        <Group title={t("position")}>
          <div className="flex flex-wrap items-center gap-x-2">
            <button
              type="button"
              disabled={pending || data.categories[0]?.id === panel.draft.id}
              onClick={() => panel.draft.id && move(data.categories, panel.draft.id, -1, "categories")}
              className={textAction("ink", "-ml-2")}
            >
              <ChevronUp aria-hidden="true" />
              {t("dishUp")}
            </button>
            <button
              type="button"
              disabled={pending || data.categories[data.categories.length - 1]?.id === panel.draft.id}
              onClick={() => panel.draft.id && move(data.categories, panel.draft.id, 1, "categories")}
              className={textAction("ink")}
            >
              <ChevronDown aria-hidden="true" />
              {t("dishDown")}
            </button>
          </div>
        </Group>
      )}

      {panel.kind === "category" && data.windowsSupported && (
        <Group title={t("windowTitle")}>
          <label className="flex min-h-12 items-center gap-3 text-name">
            <input
              type="checkbox"
              className={check}
              checked={panel.draft.limited}
              onChange={(e) =>
                setPanel({ kind: "category", draft: { ...panel.draft, limited: e.target.checked } })
              }
            />
            {t("windowToggle")}
          </label>
          {panel.draft.limited ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className={fieldLabel}>{t("windowFrom")}</span>
                  <input
                    type="time"
                    required
                    value={panel.draft.from}
                    onChange={(e) =>
                      setPanel({ kind: "category", draft: { ...panel.draft, from: e.target.value } })
                    }
                    className={clsx(input, "num")}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={fieldLabel}>{t("windowTo")}</span>
                  <input
                    type="time"
                    required
                    value={panel.draft.to}
                    onChange={(e) =>
                      setPanel({ kind: "category", draft: { ...panel.draft, to: e.target.value } })
                    }
                    className={clsx(input, "num")}
                  />
                </label>
              </div>
              <p className="text-staff-label2 m-0 text-label">{t("windowHint")}</p>
            </>
          ) : (
            <p className="text-staff-label2 m-0 text-label">{t("windowAllDay")}</p>
          )}
        </Group>
      )}

      {panel.kind === "dish" && (
        <>
          <fieldset className={fieldsetGroup}>
            <legend className={legend}>{t("optionGroups")}</legend>
            {data.groups.map((g) => (
              <label key={g.id} className="flex min-h-12 items-center gap-3 text-name">
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
            <Link href="/admin/menu/options" className={textAction("ink", "-ml-2 underline underline-offset-4")}>
              {t("manageOptions")}
            </Link>
          </fieldset>

          <fieldset className={clsx(fieldsetGroup, "flex-row flex-wrap gap-2")}>
            <legend className={legend}>{t("tags")}</legend>
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
            className={clsx(fieldsetGroup, "flex-row flex-wrap gap-2")}
            data-testid="allergens"
          >
            <legend className={legend}>{t("allergens")}</legend>
            <p className="text-staff-label2 m-0 mb-1 w-full text-label">{t("allergensHint")}</p>
            {ALLERGENS.map((a) => {
              const on = panel.draft.allergens.includes(a);
              const next = on ? panel.draft.allergens.filter((x) => x !== a) : [...panel.draft.allergens, a];
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
                        allergens: next,
                        // Any tick implies the dish was reviewed; removing the last one takes it back.
                        allergensConfirmed: next.length > 0,
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
            {data.allergenReviewSupported && (
              <label
                className="mt-1 flex min-h-12 w-full cursor-pointer items-start gap-3 py-2 text-name font-semibold has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
                data-testid="allergens-none"
              >
                <input
                  type="checkbox"
                  className={clsx(check, "mt-0.5")}
                  checked={panel.draft.allergensConfirmed && panel.draft.allergens.length === 0}
                  disabled={panel.draft.allergens.length > 0}
                  onChange={(e) =>
                    setPanel({
                      kind: "dish",
                      draft: { ...panel.draft, allergens: [], allergensConfirmed: e.target.checked },
                    })
                  }
                />
                <span>
                  {t("allergensNone")}
                  <span className="text-staff-label2 block text-label font-normal">
                    {panel.draft.allergensConfirmed || panel.draft.allergens.length > 0
                      ? t("allergensNoneHint")
                      : t("allergensNotReviewed")}
                  </span>
                </span>
              </label>
            )}
          </fieldset>

          {panel.draft.id && data.ingredientsSupported && (
            <IngredientsPanel
              itemId={panel.draft.id}
              restaurantId={data.restaurantId}
              locationId={data.locationId}
              kcalSupported={data.kcalSupported}
            />
          )}

          {panel.draft.needsReview && (
            <label className="bg-amber-tint flex min-h-12 items-center gap-3 rounded-xl px-4 py-2 text-name">
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
    <div className={clsx("flex flex-col gap-6", bar && "pb-48")}>
      {banner}
      <div
        className={clsx(
          "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6",
          panel && wide
            ? roomy
              ? "xl:grid-cols-[15rem_minmax(0,1fr)_minmax(24rem,28rem)]"
              : "xl:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]"
            : "lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)]",
        )}
      >
        <nav
          aria-label={t("categories")}
          className={clsx("flex min-w-0 flex-col gap-2 lg:self-start", panel && wide && !roomy && "hidden")}
        >
          <h2 className="m-0 text-name font-semibold">{t("categories")}</h2>
          {/* Phone and tablet: a row of section chips. From 1024 px: a list, one
              line per section, the current one tinted. The order is set in the
              section's editor, as for dishes, so no row carries arrows. */}
          <ul className="admin-scroll-row relative m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            {data.categories.map((c) => {
              const current = c.id === selected;
              const name = nameFor(c.names, locale);
              return (
                <li key={c.id} className="flex shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c.id);
                      setPanel(null);
                    }}
                    aria-current={current ? "true" : undefined}
                    title={name}
                    className={clsx(
                      "flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-full px-4 text-left text-label font-semibold whitespace-nowrap lg:rounded-xl lg:px-3",
                      current ? "bg-ink lg:bg-staff-fill lg:text-ink text-white" : "text-ink bg-staff-fill lg:bg-transparent lg:font-medium",
                    )}
                  >
                    <span className="min-w-0 truncate">{name}</span>
                    {!c.isActive && (
                      <span className="shrink-0 font-normal opacity-80">· {t("sectionOff")}</span>
                    )}
                  </button>
                </li>
              );
            })}
            <li className="flex shrink-0">
              <button
                type="button"
                onClick={() => openCategory()}
                className="text-ink inline-flex min-h-11 flex-1 items-center gap-2 rounded-full px-4 text-label font-semibold whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-staff-field)] lg:rounded-xl lg:px-3 lg:shadow-none"
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
            <header className="flex flex-wrap items-start gap-x-3 gap-y-3">
              <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                <h2 id="dishes-heading" className="m-0 text-headline leading-tight font-semibold break-words">
                  {nameFor(category.names, locale)}
                </h2>
                {category.window && (
                  <p data-testid="category-window" className="text-staff-label2 num m-0 text-label">
                    {t("windowBadge", { from: category.window.from, to: category.window.to })}
                    {!inDailyWindow(
                      localMinutes(new Date(), data.timeZone),
                      category.window.from,
                      category.window.to,
                    ) && ` · ${t("windowHiddenNow")}`}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:w-full">
                <button
                  type="button"
                  onClick={() => openCategory(category)}
                  className={textAction("ink", "underline underline-offset-4 max-sm:-ml-2")}
                >
                  <Pencil aria-hidden="true" />
                  {t("editCategory")}
                </button>
                <button type="button" onClick={() => openDish()} className={button("primary", "max-sm:w-full")}>
                  <Plus aria-hidden="true" />
                  <span className="sr-only">+ </span>
                  {t("addDish")}
                </button>
              </div>
            </header>
          )}
          {category && data.allergenReviewSupported && unreviewedCount > 0 && (
            <button
              type="button"
              aria-pressed={onlyUnreviewed}
              onClick={() => setOnlyUnreviewed((v) => !v)}
              data-testid="filter-unreviewed"
              className={clsx(
                "inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-4 text-label font-semibold",
                onlyUnreviewed ? "bg-ink text-white" : "text-ink shadow-[inset_0_0_0_1px_var(--color-staff-field)]",
              )}
            >
              {t("filterUnreviewed", { count: unreviewedCount })}
            </button>
          )}
          {category && dishes.length === 0 && (
            <p className="text-staff-label2 m-0 flex items-center gap-3 py-4 text-name">
              <UtensilsCrossed aria-hidden="true" className="size-5 shrink-0" />
              {t("emptyCategory")}
            </p>
          )}
          {shownDishes.length > 0 && (
            <ul className="border-staff-sep m-0 flex list-none flex-col border-t p-0">
              {shownDishes.map((d) => {
                const soldOut = d.id in soldOverride ? soldOverride[d.id] : data.soldOut.includes(d.id);
                const editing = panel?.kind === "dish" && panel.draft.id === d.id;
                const missing = LOCALES.filter((l) => !d.names[l]);
                return (
                  <li
                    key={d.id}
                    className={clsx(
                      "border-staff-sep flex items-center gap-3 border-b py-2",
                      editing && "bg-staff-bg shadow-[-0.5rem_0_0_var(--color-staff-bg),0.5rem_0_0_var(--color-staff-bg)]",
                    )}
                  >
                    {d.imagePath ? (
                      // eslint-disable-next-line @next/next/no-img-element -- already a 600 px WebP from Storage
                      <img
                        src={photoUrl(d.imagePath)}
                        alt=""
                        width={48}
                        height={48}
                        className={clsx("size-12 shrink-0 rounded-xl object-cover", (soldOut || !d.isActive) && "opacity-50")}
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
                        "flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg text-left",
                        soldOut || !d.isActive ? "text-staff-label2" : "text-ink",
                      )}
                      data-testid="dish-row"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className="line-clamp-2 text-name leading-snug font-semibold sm:line-clamp-1"
                          lang={d.names[locale] ? locale : "hy"}
                          title={nameFor(d.names, locale)}
                        >
                          {nameFor(d.names, locale)}
                        </span>
                        <span className="text-staff-label2 flex min-w-0 flex-wrap items-center gap-x-2 text-label leading-snug">
                          <span className="num text-ink font-semibold sm:hidden">{formatAmd(d.price, locale)}</span>
                          {!d.isActive && (
                            <span className="text-pomegranate inline-flex items-center gap-1 font-semibold">
                              <EyeOff aria-hidden="true" className="size-4" />
                              {t("dishOff")}
                            </span>
                          )}
                          {missing.length > 0 && (
                            <span className="text-amber-text inline-flex items-center gap-1 font-semibold">
                              <span aria-hidden="true" className="bg-amber-text size-2 rounded-full" />
                              {missing.join(", ")}
                              <span className="sr-only">: {t("languageMissing")}</span>
                            </span>
                          )}
                          {data.allergenReviewSupported && !d.allergensConfirmed && (
                            <span data-testid="allergens-unreviewed">{t("allergensNotReviewedChip")}</span>
                          )}
                          {d.needsReview && (
                            <span className={clsx(chip.base, chip.wait)}>
                              <TriangleAlert aria-hidden="true" />
                              {t("review")}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="num hidden shrink-0 text-name font-semibold sm:inline">
                        {formatAmd(d.price, locale)}
                      </span>
                    </button>
                    {/* The one control on the row: today's availability. */}
                    <button
                      type="button"
                      aria-pressed={soldOut}
                      disabled={pending}
                      onClick={() => toggleSoldOut(d, !soldOut)}
                      className={clsx(
                        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-label font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
                        soldOut
                          ? "bg-pomegranate text-white"
                          : "text-ink shadow-[inset_0_0_0_1px_var(--color-staff-field)]",
                      )}
                    >
                      {soldOut ? <Check aria-hidden="true" className="size-4" /> : <Ban aria-hidden="true" className="size-4" />}
                      {t("soldOut")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {panel && wide && (
          <aside
            ref={inspector}
            aria-label={panelTitle}
            className="admin-fade ring-staff-sep shadow-float flex min-w-0 flex-col self-start overflow-hidden rounded-[var(--radius-soft)] bg-white ring-1 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)]"
          >
            <header className="border-staff-sep flex min-h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
              <h2 className="m-0 min-w-0 flex-1 truncate text-name font-semibold">{panelTitle}</h2>
              <button
                type="button"
                onClick={() => setPanel(null)}
                aria-label={t("close")}
                className="bg-staff-fill text-staff-label2 inline-grid size-11 shrink-0 place-items-center rounded-full"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{form}</div>
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
              <span className="truncate text-name font-semibold">{panelTitle}</span>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className={button("secondary", "px-4")}
            >
              <Pencil aria-hidden="true" />
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

// A group of the dish or section form (ADR-093): a heading and a hairline on
// the sheet's one surface, 32 px from the next group. No card.
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-staff-sep flex flex-col gap-3 border-t pt-4 first:border-0 first:pt-0">
      <h3 className="m-0 text-name font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const fieldsetGroup = "border-staff-sep m-0 flex min-w-0 flex-col gap-1 border-0 border-t p-0 pt-4";
const legend = "float-left mb-2 w-full text-name font-semibold";

// A switch drawn as a 44 x 24 track (the control around it is the 48 px target).
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none",
        on ? "bg-tarragon" : "bg-staff-field",
      )}
    >
      <span
        className={clsx(
          "absolute top-1 size-5 rounded-full bg-white shadow transition-[left] duration-150 motion-reduce:transition-none",
          on ? "left-6" : "left-1",
        )}
      />
    </span>
  );
}

// The name (and, for a dish, the description) in one language.
function NameFields({
  l,
  panel,
  onNames,
  onDescriptions,
}: {
  l: (typeof LOCALES)[number];
  panel: NonNullable<Panel>;
  onNames: (names: Names) => void;
  onDescriptions: (descriptions: Names) => void;
}) {
  const t = useTranslations("menu");
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className={clsx(fieldLabel, "flex flex-wrap items-center gap-x-2")}>
          {t(`name.${l}`)}
          {l !== "hy" && !panel.draft.names[l] && (
            <span className="text-amber-text inline-flex items-center gap-1">
              <span aria-hidden="true" className="bg-amber-text size-2 rounded-full" />
              {t("languageMissing")}
            </span>
          )}
        </span>
        <input
          lang={l}
          value={panel.draft.names[l]}
          maxLength={panel.kind === "dish" ? 120 : 80}
          onChange={(e) => onNames({ ...panel.draft.names, [l]: e.target.value })}
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
            onChange={(e) => onDescriptions({ ...panel.draft.descriptions, [l]: e.target.value })}
            className={clsx(field, "py-2.5")}
          />
        </label>
      )}
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
        <img src={photoUrl(path)} alt="" width={96} height={96} className="size-24 rounded-xl object-cover" />
      )}
      <label
        className={button(
          "secondary",
          "has-[:focus-visible]:outline-ink cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
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
        "has-[:focus-visible]:outline-ink grid size-12 shrink-0 cursor-pointer place-items-center rounded-xl has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
        status === "failed"
          ? "bg-pom-tint text-pomegranate"
          : "bg-staff-fill text-staff-label2 hover:text-ink",
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
      <span id="cost-hint" className="text-staff-label2 num text-label">
        {margin !== null && price
          ? t("margin", { amount: formatAmd(margin, locale), pct: Math.round((margin / price) * 100) })
          : t("costHint")}
      </span>
    </label>
  );
}

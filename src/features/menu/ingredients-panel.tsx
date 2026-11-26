"use client";

import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { textAction, button, check, fieldLabel, input } from "@/features/admin-ui/styles";
import { pickIngredientName } from "@/features/ingredients/names";
import type { Locale } from "@/i18n/routing";
import { getBrowserClient } from "@/lib/supabase/browser";
import {
  addCatalogIngredient,
  addDishIngredient,
  removeDishIngredient,
  saveDishIngredient,
  setIngredientKcal,
  type IngredientResult,
} from "./ingredient-actions";

// The ingredients of one dish (ADR-076). Reads use the owner's session (RLS);
// every change goes through one server action that Postgres checks.
type Ingredient = {
  id: string;
  names: unknown;
  unit: string;
  active: boolean;
  kcal: number | null;
  gramsPerPiece: number | null;
};
// What the published menu will say for this dish (api.item_kcal): the number, or
// the ingredients that stop one ("kcal": no calories yet, "weight": no piece weight).
type KcalPreview = { kcal: number | null; missing: { id: string; reason: "kcal" | "weight" }[] };
type Line = {
  ingredientId: string;
  quantity: number;
  isKey: boolean;
  substituteId: string | null;
  priceDelta: number | null;
};
type IngredientRow = {
  id: string;
  name: string;
  name_i18n: unknown;
  unit: string;
  is_active: boolean;
  kcal_per_100g?: number | string | null;
  grams_per_piece?: number | string | null;
};
type FoundRow = { id: string; names: unknown; unit: string };
type CatalogRow = { key: string; names: unknown; unit: string };

const DEBOUNCE_MS = 250;
const UNITS = ["g", "ml", "pcs"] as const;
const DEFAULT_AMOUNT: Record<string, number> = { g: 100, ml: 100, pcs: 1 };

export function IngredientsPanel({
  itemId,
  restaurantId,
  locationId,
  kcalSupported,
}: {
  itemId: string;
  restaurantId: string;
  locationId: string;
  /** False until the calories migration (ADR-082) is applied. */
  kcalSupported: boolean;
}) {
  const t = useTranslations("menu.ingredients");
  const locale = useLocale() as Locale;
  const titleId = useId();
  const findId = useId();
  const hintId = useId();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preview, setPreview] = useState<KcalPreview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [addFailed, setAddFailed] = useState(false);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    const columns = "id, name, name_i18n, unit, is_active" + (kcalSupported ? ", kcal_per_100g, grams_per_piece" : "");
    const [l, i, k] = await Promise.all([
      supabase
        .from("recipe_lines")
        .select("ingredient_id, quantity, is_key, substitute_ingredient_id, substitute_price_delta")
        .eq("item_id", itemId),
      supabase.from("ingredients").select(columns).eq("restaurant_id", restaurantId),
      kcalSupported
        ? supabase.schema("api").rpc("item_kcal", { p_item_id: itemId })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (l.error || i.error) return setLoadFailed(true);
    setLoadFailed(false);
    setIngredients(
      ((i.data ?? []) as unknown as IngredientRow[]).map((r) => ({
        id: r.id,
        names: { hy: r.name, ...asObject(r.name_i18n) },
        unit: r.unit,
        active: r.is_active,
        kcal: r.kcal_per_100g == null ? null : Number(r.kcal_per_100g),
        gramsPerPiece: r.grams_per_piece == null ? null : Number(r.grams_per_piece),
      })),
    );
    setPreview(k.error || !k.data ? null : (k.data as unknown as KcalPreview));
    setLines(
      (l.data ?? []).map((r) => ({
        ingredientId: r.ingredient_id,
        quantity: Number(r.quantity),
        isKey: r.is_key,
        substituteId: r.substitute_ingredient_id,
        priceDelta: r.substitute_price_delta === null ? null : Number(r.substitute_price_delta),
      })),
    );
  }, [itemId, restaurantId, kcalSupported]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch once after mount (browser data, RLS applies)
    void load();
  }, [load]);

  // The café's ingredients (most used first) and, for a typed text, the common list.
  useEffect(() => {
    const q = query.trim();
    const seq = ++searchSeq.current;
    const timer = window.setTimeout(async () => {
      const api = getBrowserClient().schema("api");
      const [s, c] = await Promise.all([
        api.rpc("search_ingredients", { p_location_id: locationId, p_query: q }),
        q ? api.rpc("ingredient_catalog", { p_query: q }) : Promise.resolve({ data: [], error: null }),
      ]);
      if (seq !== searchSeq.current) return;
      setFound(s.data ?? []);
      setCatalog(c.data ?? []);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, locationId]);

  async function run(action: () => Promise<IngredientResult>) {
    setBusy(true);
    setAddFailed(false);
    const res = await action();
    setBusy(false);
    if (!res.ok) setAddFailed(true);
    await load();
  }

  const onLine = new Set((lines ?? []).map((l) => l.ingredientId));
  const cafeNames = new Set(ingredients.map((i) => pickIngredientName(i.names, "hy").toLowerCase()));
  const inCafe = found.filter((r) => !onLine.has(r.id));
  const fromList = catalog.filter((c) => !cafeNames.has(pickIngredientName(c.names, "hy").toLowerCase()));
  const typed = query.trim() !== "";

  // Enter in a field of this panel must not submit the dish form around it.
  function stopEnter(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
  }

  const sorted = [...(lines ?? [])].sort((a, b) =>
    nameOf(ingredients, a.ingredientId, locale).localeCompare(nameOf(ingredients, b.ingredientId, locale)),
  );

  return (
    <section
      aria-labelledby={titleId}
      data-testid="dish-ingredients"
      onKeyDown={stopEnter}
      className="border-staff-sep flex flex-col gap-4 border-t pt-4"
    >
      <div>
        <h3 id={titleId} className="m-0 text-name font-semibold">
          {t("title")}
        </h3>
        <p className="text-staff-label2 m-0 mt-1 text-label">{t("hint")}</p>
      </div>

      {kcalSupported && preview && lines !== null && lines.length > 0 && (
        <KcalSummary preview={preview} ingredients={ingredients} locale={locale} />
      )}
      {loadFailed && (
        <p role="alert" className="text-pomegranate m-0 text-label font-semibold">
          {t("saveFailed")}
        </p>
      )}
      {lines !== null && lines.length === 0 && (
        <p className="text-staff-label2 m-0 text-label">{t("empty")}</p>
      )}

      <ul className="m-0 flex list-none flex-col p-0">
        {sorted.map((line) => (
          <LineEditor
            key={line.ingredientId}
            itemId={itemId}
            line={line}
            name={nameOf(ingredients, line.ingredientId, locale)}
            unit={ingredients.find((i) => i.id === line.ingredientId)?.unit ?? "pcs"}
            ingredient={kcalSupported ? ingredients.find((i) => i.id === line.ingredientId) : undefined}
            options={ingredients.filter(
              (i) => i.id !== line.ingredientId && (i.active || i.id === line.substituteId),
            )}
            optionName={(i) => pickIngredientName(i.names, locale)}
            onChanged={() => void load()}
          />
        ))}
      </ul>

      <div className="border-staff-sep flex flex-col gap-3 border-t pt-4">
        <label htmlFor={findId} className={fieldLabel}>
          {t("find")}
        </label>
        <input
          id={findId}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby={hintId}
          className={input}
        />
        <p id={hintId} className="text-staff-label2 m-0 text-label">
          {t("findHint")}
        </p>
        {addFailed && (
          <p role="alert" className="text-pomegranate m-0 text-label font-semibold">
            {t("addFailed")}
          </p>
        )}

        {inCafe.length > 0 && (
          <ResultGroup title={t("inCafe")}>
            {inCafe.map((row) => (
              <ResultRow
                key={row.id}
                name={pickIngredientName(row.names, locale)}
                unit={unitLabel(t, row.unit)}
                addLabel={t("add")}
                disabled={busy}
                onAdd={() => void run(() => addDishIngredient(itemId, row.id, DEFAULT_AMOUNT[row.unit] ?? 1))}
              />
            ))}
          </ResultGroup>
        )}

        {fromList.length > 0 && (
          <ResultGroup title={t("fromList")}>
            {fromList.map((row) => (
              <ResultRow
                key={row.key}
                name={pickIngredientName(row.names, locale)}
                unit={unitLabel(t, row.unit)}
                addLabel={t("add")}
                disabled={busy}
                onAdd={() =>
                  void run(async () => {
                    const added = await addCatalogIngredient(row.key);
                    if (!added.ok || !added.id) return { ok: false, error: "failed" };
                    return addDishIngredient(itemId, added.id, DEFAULT_AMOUNT[row.unit] ?? 1);
                  })
                }
              />
            ))}
          </ResultGroup>
        )}

        {typed && inCafe.length === 0 && fromList.length === 0 && (
          <p className="text-staff-label2 m-0 text-label">{t("nothingFound")}</p>
        )}
      </div>
    </section>
  );
}

function LineEditor({
  itemId,
  line,
  name,
  unit,
  ingredient,
  options,
  optionName,
  onChanged,
}: {
  itemId: string;
  line: Line;
  name: string;
  unit: string;
  /** Set when the calorie fields are available. */
  ingredient?: Ingredient;
  options: Ingredient[];
  optionName: (i: Ingredient) => string;
  onChanged: () => void;
}) {
  const t = useTranslations("menu.ingredients");
  const ids = { keyHint: useId(), priceHint: useId() };
  const [amount, setAmount] = useState(String(line.quantity));
  const [isKey, setIsKey] = useState(line.isKey);
  const [substituteId, setSubstituteId] = useState(line.substituteId ?? "");
  const [price, setPrice] = useState(line.priceDelta === null ? "" : String(line.priceDelta));
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "failed" | "amount" | "price" | "replacement"
  >("idle");

  async function save() {
    const qty = Number(amount.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return setStatus("amount");
    const sub = isKey && substituteId ? substituteId : null;
    const digits = price.replace(/\s/g, "");
    if (digits !== "" && !/^-?\d{1,7}$/.test(digits)) return setStatus("price");
    if (digits !== "" && sub === null) return setStatus("replacement");
    setStatus("saving");
    const res = await saveDishIngredient({
      itemId,
      ingredientId: line.ingredientId,
      quantity: qty,
      isKey,
      substituteId: sub,
      priceDelta: digits === "" || sub === null ? null : Number(digits),
    });
    setStatus(res.ok ? "saved" : "failed");
    if (res.ok) onChanged();
  }

  async function remove() {
    setStatus("saving");
    const res = await removeDishIngredient(itemId, line.ingredientId);
    if (res.ok) return onChanged();
    setStatus("failed");
  }

  const message = {
    idle: "",
    saving: "",
    saved: t("saved"),
    failed: t("saveFailed"),
    amount: t("invalidAmount"),
    price: t("invalidPrice"),
    replacement: t("needReplacement"),
  }[status];

  return (
    <li className="border-staff-sep flex flex-col gap-3 border-b py-4 first:pt-1">
      <div className="flex items-center justify-between gap-3">
        <h4 className="m-0 min-w-0 text-name font-semibold [overflow-wrap:anywhere]">{name}</h4>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void remove()}
          className={textAction("danger")}
        >
          {t("remove")}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("amount", { unit: unitLabel(t, unit) })}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={clsx(input, "bg-white")}
          />
          <span className="text-staff-label2 text-label">{t("amountHint")}</span>
        </label>
        <div className="flex items-end">
          <label className="flex min-h-11 items-center gap-3 text-name font-semibold">
            <input
              type="checkbox"
              className={check}
              checked={isKey}
              aria-describedby={ids.keyHint}
              onChange={(e) => {
                setIsKey(e.target.checked);
                if (!e.target.checked) {
                  setSubstituteId("");
                  setPrice("");
                }
              }}
            />
            {t("key")}
          </label>
        </div>
      </div>
      <p id={ids.keyHint} className="text-staff-label2 m-0 text-label">
        {t("keyHint")}
      </p>

      {ingredient && <KcalFields ingredient={ingredient} unit={unit} onChanged={onChanged} />}

      {isKey && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("replacedBy")}</span>
            <select
              value={substituteId}
              onChange={(e) => {
                setSubstituteId(e.target.value);
                if (!e.target.value) setPrice("");
              }}
              className={clsx(input, "bg-white")}
            >
              <option value="">{t("noReplacement")}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionName(o)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("priceChange")}</span>
            <input
              inputMode="numeric"
              value={price}
              disabled={!substituteId}
              aria-describedby={ids.priceHint}
              onChange={(e) => setPrice(e.target.value)}
              className={clsx(input, "bg-white")}
            />
            <span id={ids.priceHint} className="text-staff-label2 text-label">
              {t("priceHint")}
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void save()}
          className={button("secondary", "px-5")}
        >
          {t("save")}
        </button>
        <p
          role="status"
          aria-live="polite"
          className={clsx(
            "m-0 text-label font-semibold",
            status === "saved" ? "text-tarragon" : "text-pomegranate",
          )}
        >
          {message}
        </p>
      </div>
    </li>
  );
}

// "Guests will see ≈ 620 kcal" or why there is no number yet.
function KcalSummary({
  preview,
  ingredients,
  locale,
}: {
  preview: KcalPreview;
  ingredients: Ingredient[];
  locale: Locale;
}) {
  const t = useTranslations("menu.ingredients");
  const names = (reason: "kcal" | "weight") =>
    preview.missing
      .filter((m) => m.reason === reason)
      .map((m) => nameOf(ingredients, m.id, locale))
      .join(", ");
  const noCalories = names("kcal");
  const noWeight = names("weight");
  return (
    <div data-testid="kcal-summary" className="bg-staff-bg rounded-xl px-4 py-3 text-label" role="status">
      <p className="m-0 font-semibold">{t("kcalNone")}</p>
      {preview.kcal !== null && (
        <p className="m-0 mt-1" data-testid="kcal-value">
          {t("kcalShown", { value: new Intl.NumberFormat(locale).format(preview.kcal) })}
        </p>
      )}
      {noCalories && <p className="text-staff-label2 m-0 mt-1">{t("kcalMissing", { names: noCalories })}</p>}
      {noWeight && <p className="text-staff-label2 m-0 mt-1">{t("weightMissing", { names: noWeight })}</p>}
    </div>
  );
}

// Calories per 100 g and the weight of one piece: both belong to the ingredient,
// so they apply to every dish that uses it.
function KcalFields({
  ingredient,
  unit,
  onChanged,
}: {
  ingredient: Ingredient;
  unit: string;
  onChanged: () => void;
}) {
  const t = useTranslations("menu.ingredients");
  const hintId = useId();
  const [kcal, setKcal] = useState(ingredient.kcal === null ? "" : String(ingredient.kcal));
  const [piece, setPiece] = useState(ingredient.gramsPerPiece === null ? "" : String(ingredient.gramsPerPiece));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed" | "kcal" | "piece">("idle");

  async function save() {
    const k = kcal.trim() === "" ? null : Number(kcal.replace(",", "."));
    const p = piece.trim() === "" ? null : Number(piece.replace(",", "."));
    if (k !== null && (!Number.isFinite(k) || k < 0 || k > 1000)) return setStatus("kcal");
    if (p !== null && (!Number.isFinite(p) || p < 0.1 || p > 10000)) return setStatus("piece");
    setStatus("saving");
    const res = await setIngredientKcal({ ingredientId: ingredient.id, kcalPer100: k, gramsPerPiece: p });
    setStatus(res.ok ? "saved" : "failed");
    if (res.ok) onChanged();
  }

  const message = {
    idle: "",
    saving: "",
    saved: t("saved"),
    failed: t("saveFailed"),
    kcal: t("invalidKcal"),
    piece: t("invalidPiece"),
  }[status];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("kcalPer100", { unit: unit === "ml" ? t("unit.ml") : t("unit.g") })}</span>
          <input
            inputMode="decimal"
            value={kcal}
            aria-describedby={hintId}
            onChange={(e) => setKcal(e.target.value)}
            className={clsx(input, "bg-white")}
          />
        </label>
        {unit === "pcs" && (
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("gramsPerPiece")}</span>
            <input
              inputMode="decimal"
              value={piece}
              aria-describedby={hintId}
              onChange={(e) => setPiece(e.target.value)}
              className={clsx(input, "bg-white")}
            />
          </label>
        )}
      </div>
      <p id={hintId} className="text-staff-label2 m-0 text-label">
        {t("kcalHint")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void save()}
          className={button("secondary", "px-5")}
        >
          {t("kcalSave")}
        </button>
        <p
          role="status"
          aria-live="polite"
          className={clsx(
            "m-0 text-label font-semibold",
            status === "saved" ? "text-tarragon" : "text-pomegranate",
          )}
        >
          {message}
        </p>
      </div>
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-staff-label2 m-0 text-label font-semibold">{title}</h4>
      <ul className="m-0 flex max-h-72 list-none flex-col overflow-y-auto p-0">{children}</ul>
    </div>
  );
}

function ResultRow({
  name,
  unit,
  addLabel,
  disabled,
  onAdd,
}: {
  name: string;
  unit: string;
  addLabel: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        className="hover:bg-staff-fill focus-visible:outline-ink flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left disabled:opacity-50"
      >
        <span className="min-w-0 text-name [overflow-wrap:anywhere]">{name}</span>
        <span className="text-staff-label2 flex shrink-0 items-center gap-2 text-label font-semibold">
          {unit}
          <Plus aria-hidden="true" className="size-4" />
          {addLabel}
        </span>
      </button>
    </li>
  );
}

function nameOf(list: Ingredient[], id: string, locale: Locale): string {
  const found = list.find((i) => i.id === id);
  return found ? pickIngredientName(found.names, locale) : "";
}

function asObject(value: unknown): Record<string, string> {
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

function unitLabel(t: (key: string) => string, unit: string): string {
  return (UNITS as readonly string[]).includes(unit) ? t(`unit.${unit}`) : unit;
}

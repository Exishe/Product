"use client";

import { clsx } from "clsx";
import { CircleAlert, PackageX, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { pickIngredientName } from "@/features/ingredients/names";
import { mergeOutRows, type OutRow } from "@/features/ingredients/out-rows";
import type { Locale } from "@/i18n/routing";
import { getBrowserClient } from "@/lib/supabase/browser";

// Staff mark an ingredient out in one tap, and bring it back with Back (ADR-076).
// The same rule the kitchen's stop list uses: the outage ends by itself at the
// business day's end. Tablet-first (ADR-054): big targets, no animations.
const DEBOUNCE_MS = 250;

type Found = { id: string; name: string };

export function IngredientOut({
  locationId,
  rowClassName,
  onCount,
}: {
  locationId: string;
  /** Drawn as a row of the header's «…» menu instead of a pill. */
  rowClassName?: string;
  /** How many ingredients are out, for a badge on the menu button. */
  onCount?: (count: number) => void;
}) {
  const t = useTranslations("kitchen.ingredients");
  const locale = useLocale() as Locale;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const searchId = useId();
  const seq = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  // Names of ingredients seen in this session, so an out one can be shown at the top.
  const [known, setKnown] = useState<Map<string, string>>(() => new Map());
  // Active outages of this café (the id of each ingredient that is out now).
  const [outIds, setOutIds] = useState<ReadonlySet<string>>(() => new Set());
  // Every outage with its name (api.list_ingredient_outages); null on a database without it.
  const [listed, setListed] = useState<OutRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const refreshOutages = useCallback(async () => {
    const client = getBrowserClient();
    const list = await client.schema("api").rpc("list_ingredient_outages", { p_location_id: locationId });
    if (!list.error) {
      const rows = (list.data ?? []).map((r) => ({
        id: r.id,
        name: pickIngredientName(r.names, locale),
      }));
      setListed(rows);
      setOutIds(new Set(rows.map((r) => r.id)));
      return;
    }
    // A database without the function: ids only, as before.
    setListed(null);
    const res = await client
      .from("ingredient_outages")
      .select("ingredient_id, until")
      .eq("location_id", locationId)
      .gt("until", new Date().toISOString());
    if (!res.error) setOutIds(new Set((res.data ?? []).map((r) => r.ingredient_id)));
  }, [locationId, locale]);

  useEffect(() => {
    onCount?.(outIds.size);
  }, [outIds, onCount]);

  // Opening the list reads what is out now.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read on open (browser data, RLS applies)
    void refreshOutages();
  }, [isOpen, refreshOutages]);

  // Most used first; a typed text matches the Armenian, Russian or English name.
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    const mine = ++seq.current;
    const timer = window.setTimeout(async () => {
      const res = await getBrowserClient()
        .schema("api")
        .rpc("search_ingredients", { p_location_id: locationId, p_query: q });
      if (mine !== seq.current) return;
      if (res.error) return setFailed(true);
      const rows = (res.data ?? []).map((r) => ({
        id: r.id,
        name: pickIngredientName(r.names, locale) || r.name,
      }));
      setFound(rows);
      setKnown((prev) => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, r.name);
        return next;
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, query, locationId, locale]);

  async function setOut(id: string, out: boolean) {
    setBusyId(id);
    setFailed(false);
    const { error } = await getBrowserClient()
      .schema("api")
      .rpc("set_ingredient_out", { p_location_id: locationId, p_ingredient_id: id, p_out: out });
    setBusyId(null);
    if (error) setFailed(true);
    await refreshOutages();
  }

  const { rows: outRows, unnamed: unknownOut } = mergeOutRows(outIds, listed, known);
  const shownOut = new Set(outRows.map((r) => r.id));
  const others = found.filter((r) => !outIds.has(r.id) && !shownOut.has(r.id));
  const typed = query.trim() !== "";

  return (
    <>
      <button
        type="button"
        data-testid="ingredient-out-button"
        aria-haspopup="dialog"
        onClick={() => {
          setFailed(false);
          setIsOpen(true);
          dialog.current?.showModal();
        }}
        className={
          rowClassName ??
          clsx(
            "bg-basalt-3 text-slip inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[1.0625rem] font-semibold",
            outIds.size > 0 && "ring-pom-on-dark ring-2",
          )
        }
      >
        <PackageX aria-hidden="true" className="size-5 shrink-0" />
        <span className={rowClassName ? "min-w-0 flex-1" : "max-sm:sr-only"}>{t("button")}</span>
        {outIds.size > 0 && (
          <span
            data-testid="ingredient-out-count"
            className="num bg-pom-on-dark grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1.5 text-sm font-bold text-white"
          >
            {outIds.size}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setIsOpen(false)}
        className="bg-basalt-2 text-slip mt-0 mr-0 ml-auto h-dvh max-h-none w-[min(30rem,100vw)] max-w-none border-l border-(--kds-frame) p-0 backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-(--kds-frame) px-6 py-4">
            <div>
              <h2 id={titleId} className="text-2xl font-semibold">
                {t("title")}
              </h2>
              <p className="text-slip-dim mt-1 text-[1.0625rem] leading-snug">{t("hint")}</p>
            </div>
            <button
              type="button"
              aria-label={t("close")}
              title={t("close")}
              onClick={() => dialog.current?.close()}
              className="bg-basalt-3 text-slip grid size-12 shrink-0 place-items-center rounded-full"
            >
              <X aria-hidden="true" className="size-6" />
            </button>
          </div>

          <div className="flex flex-col gap-3 px-6 pt-4">
            <label htmlFor={searchId} className="text-slip-dim text-base font-bold">
              {t("search")}
            </label>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="text-slip-dim pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
              />
              <input
                id={searchId}
                type="search"
                autoComplete="off"
                value={query}
                placeholder={t("searchPlaceholder")}
                onChange={(e) => setQuery(e.target.value)}
                className="text-slip placeholder:text-slip-dim focus-visible:border-slip h-14 w-full min-w-0 rounded-xl border-2 border-(--kds-edge) bg-white pr-4 pl-12 text-lg"
              />
            </span>
            {failed && (
              <p
                role="alert"
                className="bg-late-on-dark flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-white"
              >
                <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
                {t("failed")}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
            {outRows.length > 0 && (
              <section className="mb-5" aria-label={t("outNow")}>
                <h3 className="text-slip-dim mb-2 text-base font-bold">{t("outNow")}</h3>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {outRows.map((row) => (
                    <li
                      key={row.id}
                      className="bg-basalt-3 border-pom-on-dark flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 px-4 py-2"
                    >
                      <span className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
                        {row.name}
                      </span>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void setOut(row.id, false)}
                        className="bg-slip inline-flex min-h-14 shrink-0 items-center rounded-xl px-5 text-lg font-bold text-white disabled:opacity-60"
                      >
                        {t("back")}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {unknownOut > 0 && (
              <p className="text-slip-dim mb-5 text-base">{t("moreOut", { count: unknownOut })}</p>
            )}

            {others.length > 0 && (
              <ul className="m-0 grid list-none gap-2 p-0">
                {others.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void setOut(row.id, true)}
                      className="bg-basalt-3 flex min-h-16 w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-left disabled:opacity-60"
                    >
                      <span className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
                        {row.name}
                      </span>
                      <span className="text-pom-on-dark shrink-0 text-base font-bold">{t("markOut")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {typed && found.length === 0 && <p className="text-slip-dim mt-6 text-lg">{t("empty")}</p>}
          </div>
        </div>
      </dialog>
    </>
  );
}

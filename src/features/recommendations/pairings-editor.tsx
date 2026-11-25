"use client";

import { Lightbulb, Plus, RotateCcw, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Notice, Section } from "@/features/admin-ui/page";
import { useToast } from "@/features/admin-ui/toast";
import { button, check, chip, field, fieldLabel, input, iconButton } from "@/features/admin-ui/styles";
import {
  addPairing,
  applyItemTypes,
  proposeItemTypes,
  removePairing,
  resetCompat,
  setCompat,
  setItemType,
  type Proposal,
} from "./actions";
import {
  groupByCategory,
  hasCustomRules,
  isItemType,
  ITEM_TYPES,
  matrixRows,
  MAX_PAIRINGS,
  nameIn,
  searchDishes,
  type Category,
  type Dish,
  type ItemType,
  type MatrixCell,
} from "./model";
import { TimeRules } from "./time-rules-section";
import type { TimeRule } from "./time-rules";

type Pairing = { itemId: string; suggestId: string };

// The owner's "Goes well with" page (ADR-077): the kind of each dish, hand-made
// pairings, and the table of what may be suggested after what.
export function PairingsEditor({
  categories,
  dishes: initialDishes,
  pairings: initialPairings,
  matrix: initialMatrix,
  timeRules,
}: {
  categories: Category[];
  dishes: Dish[];
  pairings: Pairing[];
  matrix: MatrixCell[];
  timeRules: TimeRule[] | null;
}) {
  const t = useTranslations("recommendations");
  const locale = useLocale();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dishes, setDishes] = useState(initialDishes);
  const [pairings, setPairings] = useState(initialPairings);
  const [matrix, setMatrix] = useState(initialMatrix);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<(Proposal & { on: boolean })[] | null>(null);
  const [current, setCurrent] = useState(initialDishes[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const dishName = (id: string) => nameIn(dishes.find((d) => d.id === id)?.names ?? { hy: "", ru: "", en: "" }, locale);
  const groups = useMemo(() => groupByCategory(dishes, categories), [dishes, categories]);
  const rows = useMemo(() => matrixRows(matrix), [matrix]);
  const kindLabel = (k: ItemType) => t(`kinds.${k}`);

  const mine = pairings.filter((p) => p.itemId === current);
  const found = searchDishes(dishes, query, new Set([current, ...mine.map((p) => p.suggestId)]));

  function run(work: () => Promise<boolean>, done?: string) {
    setError(null);
    startTransition(async () => {
      const ok = await work();
      if (!ok) setError(t("failed"));
      else if (done) toast(done);
    });
  }

  function changeType(id: string, value: string) {
    const type = isItemType(value) ? value : null;
    run(async () => {
      const r = await setItemType(id, type);
      if (r.ok) setDishes((all) => all.map((d) => (d.id === id ? { ...d, type } : d)));
      return r.ok;
    }, t("types.saved"));
  }

  function suggest() {
    run(async () => {
      const r = await proposeItemTypes();
      if (!r.ok) return false;
      setProposals(r.proposals.map((p) => ({ ...p, on: true })));
      return true;
    });
  }

  function applyProposals() {
    const chosen = (proposals ?? []).filter((p) => p.on).map(({ itemId, type }) => ({ itemId, type }));
    run(async () => {
      const r = await applyItemTypes(chosen);
      if (!r.ok) return false;
      setDishes((all) => all.map((d) => chosen.find((p) => p.itemId === d.id) ? { ...d, type: chosen.find((p) => p.itemId === d.id)!.type } : d));
      setProposals(null);
      return true;
    }, t("types.applied", { count: chosen.length }));
  }

  function add(suggestId: string) {
    run(async () => {
      const r = await addPairing(current, suggestId, mine.length);
      if (!r.ok) {
        if (r.error === "limit") setError(t("pairings.limit", { max: MAX_PAIRINGS }));
        return r.error === "limit";
      }
      setPairings((all) => [...all, { itemId: current, suggestId }]);
      setQuery("");
      return true;
    });
  }

  function remove(suggestId: string) {
    run(async () => {
      const r = await removePairing(current, suggestId);
      if (r.ok) setPairings((all) => all.filter((p) => !(p.itemId === current && p.suggestId === suggestId)));
      return r.ok;
    });
  }

  function toggle(from: ItemType, to: ItemType, allowed: boolean) {
    // The tick answers at once; it goes back if the save fails.
    const before = matrix;
    setMatrix((all) => {
      const rest = all.filter((c) => !(c.from_type === from && c.to_type === to));
      const old = all.find((c) => c.from_type === from && c.to_type === to);
      // Each tick flips the pair between "as the default" and "changed".
      const wasCustom = old?.is_custom ?? false;
      return [...rest, { from_type: from, to_type: to, allowed, is_custom: !wasCustom }];
    });
    run(async () => {
      const r = await setCompat(from, to, allowed);
      if (!r.ok) setMatrix(before);
      return r.ok;
    });
  }

  function reset() {
    run(async () => {
      const r = await resetCompat();
      if (r.ok) window.location.reload();   // the defaults live in the database: ask again
      return r.ok;
    });
  }

  if (dishes.length === 0) {
    return <Notice tone="info" icon={<Lightbulb aria-hidden="true" />}>{t("noDishes")}</Notice>;
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div role="alert" data-testid="rec-error" className="bg-pom-tint text-pomegranate rounded-xl px-4 py-3 text-[1rem]">
          {error}
        </div>
      )}

      <Section
        title={t("types.title")}
        hint={t("types.hint")}
        id="rec-types"
        testId="rec-types"
        actions={
          <button type="button" data-testid="rec-suggest" className={button("secondary", "min-h-11 text-[0.9375rem]")} disabled={pending} onClick={suggest}>
            <Lightbulb aria-hidden="true" className="!size-4" />
            {t("types.suggest")}
          </button>
        }
      >
        {proposals && (
          <div data-testid="rec-proposals" className="bg-staff-fill flex flex-col gap-3 rounded-xl p-3">
            <p className="m-0 text-[1rem] font-semibold">{t("types.proposalsTitle")}</p>
            {proposals.length === 0 ? (
              <p className="text-staff-label2 m-0 text-[1rem]">{t("types.proposalsEmpty")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {proposals.map((p, i) => (
                  <li key={p.itemId}>
                    <label className="flex min-h-11 items-center gap-3 py-1 text-[1rem]">
                      <input
                        type="checkbox"
                        className={check}
                        checked={p.on}
                        onChange={(e) => setProposals((all) => all!.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                      />
                      <span className="min-w-0 flex-1 break-words">{dishName(p.itemId)}</span>
                      <span className={`${chip.base} ${chip.plain}`}>{kindLabel(p.type)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {proposals.length > 0 && (
                <button
                  type="button"
                  data-testid="rec-apply"
                  className={button("primary", "min-h-11 text-[0.9375rem]")}
                  disabled={pending || !proposals.some((p) => p.on)}
                  onClick={applyProposals}
                >
                  {t("types.apply", { count: proposals.filter((p) => p.on).length })}
                </button>
              )}
              <button type="button" className={button("tinted", "min-h-11 text-[0.9375rem]")} onClick={() => setProposals(null)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.category.id} className="flex flex-col">
            <h3 className="text-staff-label2 m-0 pb-1 text-[0.9375rem] font-semibold">{nameIn(g.category.names, locale)}</h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {g.dishes.map((d) => (
                <li key={d.id} className="border-staff-sep flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1 text-[1.0625rem] break-words">{nameIn(d.names, locale)}</span>
                  <select
                    aria-label={t("types.dishKind", { dish: nameIn(d.names, locale) })}
                    data-testid={`rec-type-${d.id}`}
                    className={`${field} h-11 sm:w-60`}
                    value={d.type ?? ""}
                    disabled={pending}
                    onChange={(e) => changeType(d.id, e.target.value)}
                  >
                    <option value="">{t("types.none")}</option>
                    {ITEM_TYPES.map((k) => (
                      <option key={k} value={k}>
                        {kindLabel(k)}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title={t("pairings.title")} hint={t("pairings.hint", { max: MAX_PAIRINGS })} id="rec-pairings" testId="rec-pairings">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>{t("pairings.dish")}</span>
          <select
            data-testid="rec-dish"
            className={`${field} h-12`}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setQuery("");
            }}
          >
            {groups.map((g) => (
              <optgroup key={g.category.id} label={nameIn(g.category.names, locale)}>
                {g.dishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {nameIn(d.names, locale)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {mine.length === 0 ? (
          <p className="text-staff-label2 m-0 text-[1rem]">{t("pairings.empty")}</p>
        ) : (
          <ul data-testid="rec-pairs" className="m-0 flex list-none flex-col p-0">
            {mine.map((p) => (
              <li key={p.suggestId} className="border-staff-sep flex items-center gap-2 border-b py-1 last:border-0">
                <span className="min-w-0 flex-1 text-[1.0625rem] break-words">{dishName(p.suggestId)}</span>
                <button
                  type="button"
                  className={iconButton()}
                  aria-label={t("pairings.remove", { dish: dishName(p.suggestId) })}
                  disabled={pending}
                  onClick={() => remove(p.suggestId)}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {mine.length < MAX_PAIRINGS && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className={fieldLabel}>{t("pairings.search")}</span>
              <input
                type="search"
                data-testid="rec-search"
                className={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {found.length === 0 ? (
              <p className="text-staff-label2 m-0 text-[1rem]">{t("pairings.noResults")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {found.map((d) => (
                  <li key={d.id} className="border-staff-sep flex items-center gap-2 border-b py-1 last:border-0">
                    <span className="min-w-0 flex-1 text-[1.0625rem] break-words">{nameIn(d.names, locale)}</span>
                    <button
                      type="button"
                      data-testid={`rec-add-${d.id}`}
                      className={button("tinted", "min-h-11 text-[0.9375rem]")}
                      aria-label={t("pairings.add", { dish: nameIn(d.names, locale) })}
                      disabled={pending}
                      onClick={() => add(d.id)}
                    >
                      <Plus aria-hidden="true" className="!size-4" />
                      {t("pairings.addShort")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <TimeRules rules={timeRules} categories={categories} dishes={dishes} />

      <Section
        title={t("matrix.title")}
        hint={t("matrix.hint")}
        id="rec-matrix"
        testId="rec-matrix"
        actions={
          <button
            type="button"
            data-testid="rec-reset"
            className={button("secondary", "min-h-11 text-[0.9375rem]")}
            disabled={pending || !hasCustomRules(rows)}
            onClick={reset}
          >
            <RotateCcw aria-hidden="true" className="!size-4" />
            {t("matrix.reset")}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <details key={r.from} className="border-staff-sep rounded-xl border">
              <summary
                data-testid={`rec-after-${r.from}`}
                className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 text-[1rem] font-semibold"
              >
                <span className="min-w-0 break-words">{t("matrix.after", { kind: kindLabel(r.from) })}</span>
                <span className={`${chip.base} ${chip.plain}`}>{r.cells.filter((c) => c.allowed).length}</span>
              </summary>
              <div className="grid grid-cols-1 gap-x-4 px-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
                {r.cells.map((c) => (
                  <label key={c.to} className="flex min-h-11 items-center gap-3 text-[1rem]">
                    <input
                      type="checkbox"
                      className={check}
                      data-testid={`rec-cell-${r.from}-${c.to}`}
                      checked={c.allowed}
                      disabled={pending}
                      onChange={(e) => toggle(r.from, c.to, e.target.checked)}
                    />
                    <span className="min-w-0 break-words">{kindLabel(c.to)}</span>
                    {c.custom && <span className={`${chip.base} ${chip.wait}`}>{t("matrix.changed")}</span>}
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}

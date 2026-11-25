"use client";

import { clsx } from "clsx";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Section } from "@/features/admin-ui/page";
import { useToast } from "@/features/admin-ui/toast";
import { button, check, chip, field, fieldLabel, iconButton, input } from "@/features/admin-ui/styles";
import { removeTimeRule, saveTimeRule } from "./actions";
import { groupByCategory, ITEM_TYPES, nameIn, type Category, type Dish, type ItemType } from "./model";
import {
  draftFromRule,
  emptyDraft,
  MAX_TIME_RULES,
  passesMidnight,
  ruleFromDraft,
  sortRules,
  weekdayRuns,
  type TimeRule,
  type TimeRuleDraft,
} from "./time-rules";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// "By time of day" (ADR-086): rules that suggest a kind of dish or one dish at
// certain hours, whatever the guest added. The list and the small form live
// here; the rules themselves are checked and stored by Postgres.
export function TimeRules({
  rules: initial,
  categories,
  dishes,
}: {
  /** null: the rules could not be read. */
  rules: TimeRule[] | null;
  categories: Category[];
  dishes: Dish[];
}) {
  const t = useTranslations("recommendations");
  const locale = useLocale();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rules, setRules] = useState(initial);
  const [draft, setDraft] = useState<TimeRuleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => groupByCategory(dishes, categories), [dishes, categories]);
  const day = (d: number) => t(`timeRules.days.short.${d}`);
  const full = rules === null || rules.length >= MAX_TIME_RULES;

  function what(r: TimeRule): string {
    if (r.toType) return t(`kinds.${r.toType}`);
    const dish = dishes.find((d) => d.id === r.toItemId);
    return dish ? nameIn(dish.names, locale) : t("timeRules.dishGone");
  }

  function days(r: TimeRule): string {
    const runs = weekdayRuns(r.weekdays);
    if (runs.length === 0) return t("timeRules.everyDay");
    return runs.map(([a, b]) => (a === b ? day(a) : `${day(a)}–${day(b)}`)).join(", ");
  }

  function add() {
    setError(null);
    setDraft(emptyDraft());
  }

  function edit(rule: TimeRule) {
    setError(null);
    const d = draftFromRule(rule);
    // A dish that left the menu cannot be picked again: make the owner choose.
    setDraft(d.target === "dish" && !dishes.some((x) => x.id === d.toItemId) ? { ...d, toItemId: "" } : d);
  }

  function save() {
    if (!draft) return;
    const built = ruleFromDraft(draft);
    if (!built.ok) return setError(t(`timeRules.errors.${built.error}`));
    const rule = built.rule;
    setError(null);
    startTransition(async () => {
      const r = await saveTimeRule(rule);
      if (!r.ok) {
        setError(r.error === "limit" ? t("timeRules.errors.limit", { max: MAX_TIME_RULES }) : t("failed"));
        return;
      }
      const saved: TimeRule = { ...rule, id: r.id };
      setRules((all) => sortRules([...(all ?? []).filter((x) => x.id !== saved.id), saved]));
      setDraft(null);
      toast(t("timeRules.saved"));
    });
  }

  // Deleting asks once, in the row (as promos do).
  const [confirming, setConfirming] = useState<string | null>(null);

  function remove(rule: TimeRule) {
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      const r = await removeTimeRule(rule.id);
      if (!r.ok) return setError(t("failed"));
      setRules((all) => (all ?? []).filter((x) => x.id !== rule.id));
      setDraft((d) => (d?.id === rule.id ? null : d));
      toast(t("timeRules.removed"));
    });
  }

  const set = (patch: Partial<TimeRuleDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Section
      title={t("timeRules.title")}
      hint={t("timeRules.hint", { max: MAX_TIME_RULES })}
      id="rec-time"
      testId="rec-time"
      actions={
        rules !== null && (
          <button
            type="button"
            data-testid="time-rule-add"
            className={button("secondary", "min-h-11 text-[0.9375rem]")}
            disabled={pending || full}
            onClick={add}
          >
            <Plus aria-hidden="true" className="!size-4" />
            {t("timeRules.add")}
          </button>
        )
      }
    >
      {error && (
        <div role="alert" data-testid="time-rule-error" className="bg-pom-tint text-pomegranate rounded-xl px-4 py-3 text-[1rem]">
          {error}
        </div>
      )}

      {rules === null ? (
        <p data-testid="time-rules-unavailable" className="text-staff-label2 m-0 text-[1rem]">
          {t("timeRules.unavailable")}
        </p>
      ) : (
        <>
          {draft && (
            <form
              noValidate
              data-testid="time-rule-form"
              aria-labelledby="time-rule-form-title"
              className="bg-staff-fill flex flex-col gap-4 rounded-xl p-3 sm:p-4"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <h3 id="time-rule-form-title" className="m-0 text-[1.0625rem] font-semibold">
                {draft.id ? t("timeRules.editTitle") : t("timeRules.newTitle")}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className={fieldLabel}>{t("timeRules.from")}</span>
                  <input
                    type="time"
                    required
                    autoFocus
                    data-testid="time-rule-from"
                    value={draft.from}
                    onChange={(e) => set({ from: e.target.value })}
                    className={clsx(input, "num")}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={fieldLabel}>{t("timeRules.to")}</span>
                  <input
                    type="time"
                    required
                    data-testid="time-rule-to"
                    value={draft.to}
                    onChange={(e) => set({ to: e.target.value })}
                    className={clsx(input, "num")}
                  />
                </label>
              </div>
              {passesMidnight(draft.from, draft.to) && (
                <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("timeRules.passesMidnight")}</p>
              )}

              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className={clsx(fieldLabel, "mb-1")}>{t("timeRules.daysTitle")}</legend>
                <div className="grid grid-cols-4 gap-x-2 sm:grid-cols-7">
                  {DAYS.map((d) => (
                    <label key={d} className="flex min-h-11 items-center gap-2 text-[1rem]">
                      <input
                        type="checkbox"
                        className={check}
                        data-testid={`time-rule-day-${d}`}
                        aria-label={t(`timeRules.days.long.${d}`)}
                        checked={draft.days.includes(d)}
                        onChange={(e) =>
                          set({ days: e.target.checked ? [...draft.days, d] : draft.days.filter((x) => x !== d) })
                        }
                      />
                      <span aria-hidden="true">{day(d)}</span>
                    </label>
                  ))}
                </div>
                <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("timeRules.daysHint")}</p>
              </fieldset>

              <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
                <legend className={clsx(fieldLabel, "mb-1")}>{t("timeRules.whatTitle")}</legend>
                <label className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
                  <input
                    type="radio"
                    name="time-rule-target"
                    className={check}
                    data-testid="time-rule-target-type"
                    checked={draft.target === "type"}
                    onChange={() => set({ target: "type" })}
                  />
                  {t("timeRules.whatKind")}
                </label>
                <label className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
                  <input
                    type="radio"
                    name="time-rule-target"
                    className={check}
                    data-testid="time-rule-target-dish"
                    checked={draft.target === "dish"}
                    onChange={() => set({ target: "dish" })}
                  />
                  {t("timeRules.whatDish")}
                </label>
                {draft.target === "type" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="sr-only">{t("timeRules.kind")}</span>
                    <select
                      data-testid="time-rule-kind"
                      className={clsx(field, "h-12")}
                      value={draft.toType}
                      onChange={(e) => set({ toType: e.target.value })}
                    >
                      <option value="">{t("timeRules.kindPlaceholder")}</option>
                      {ITEM_TYPES.map((k: ItemType) => (
                        <option key={k} value={k}>
                          {t(`kinds.${k}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="flex flex-col gap-1.5">
                    <span className="sr-only">{t("timeRules.dish")}</span>
                    <select
                      data-testid="time-rule-dish"
                      className={clsx(field, "h-12")}
                      value={draft.toItemId}
                      onChange={(e) => set({ toItemId: e.target.value })}
                    >
                      <option value="">{t("timeRules.dishPlaceholder")}</option>
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
                )}
              </fieldset>

              <label className="flex flex-col gap-1.5">
                <span className={fieldLabel}>{t("timeRules.order")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  data-testid="time-rule-order"
                  value={draft.order}
                  onChange={(e) => set({ order: e.target.value })}
                  className={clsx(input, "num sm:max-w-40")}
                />
                <span className="text-staff-label2 text-[0.9375rem]">{t("timeRules.orderHint")}</span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="submit" data-testid="time-rule-save" className={button("primary", "min-h-11 text-[0.9375rem]")} disabled={pending}>
                  {t("timeRules.save")}
                </button>
                <button type="button" className={button("secondary", "min-h-11 text-[0.9375rem]")} onClick={() => setDraft(null)}>
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}

          {rules.length === 0 ? (
            !draft && <p className="text-staff-label2 m-0 text-[1rem]">{t("timeRules.empty")}</p>
          ) : (
            <ul data-testid="time-rules" className="m-0 flex list-none flex-col p-0">
              {rules.map((r) => (
                <li
                  key={r.id}
                  data-testid="time-rule"
                  className="border-staff-sep flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-0"
                >
                  <div className="flex min-w-0 flex-1 basis-40 flex-col">
                    <span className="text-[1.0625rem] font-semibold break-words">{t("timeRules.suggest", { what: what(r) })}</span>
                    <span className="text-staff-label2 text-[0.9375rem]">
                      <span className="num">
                        {r.from}–{r.to}
                      </span>
                      {" · "}
                      {days(r)}
                      {passesMidnight(r.from, r.to) && <span className={`${chip.base} ${chip.plain} ml-2`}>{t("timeRules.overnight")}</span>}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      data-testid="time-rule-edit"
                      className={button("tinted", "min-h-11 text-[0.9375rem] max-sm:w-11 max-sm:px-0")}
                      aria-label={t("timeRules.editRule", { from: r.from, to: r.to })}
                      disabled={pending}
                      onClick={() => edit(r)}
                    >
                      <Pencil aria-hidden="true" className="!size-4" />
                      <span className="max-sm:sr-only">{t("timeRules.edit")}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="time-rule-remove"
                      className={iconButton()}
                      aria-label={t("timeRules.removeRule", { from: r.from, to: r.to })}
                      aria-expanded={confirming === r.id}
                      disabled={pending}
                      onClick={() => setConfirming(r.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                  {confirming === r.id && (
                    <div role="group" className="flex w-full flex-wrap items-center gap-2 pt-1">
                      <p className="m-0 flex-1 basis-48 text-[1.0625rem]">
                        {t("timeRules.removeConfirm", { from: r.from, to: r.to })}
                      </p>
                      <button
                        type="button"
                        data-testid="time-rule-remove-yes"
                        disabled={pending}
                        onClick={() => remove(r)}
                        className={button("destructive", "flex-1 sm:flex-none")}
                      >
                        {t("timeRules.removeYes")}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirming(null)}
                        className={button("tinted", "flex-1 sm:flex-none")}
                      >
                        {t("timeRules.removeNo")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {rules.length >= MAX_TIME_RULES && (
            <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("timeRules.errors.limit", { max: MAX_TIME_RULES })}</p>
          )}
        </>
      )}
    </Section>
  );
}

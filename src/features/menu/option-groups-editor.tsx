"use client";

import { clsx } from "clsx";
import { ChevronRight, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/routing";
import { Sheet, useMediaQuery } from "@/features/admin-ui/sheet";
import { button, check, fieldLabel, input } from "@/features/admin-ui/styles";
import { formatAmd, formatAmdChange } from "@/lib/format/money";
import { saveOptionGroup } from "./actions";
import { parsePriceInput } from "./schema";
import { emptyNames, type EditorGroup, type Names } from "./types";

const LOCALES = ["hy", "ru", "en"] as const;
const FORM_ID = "option-group-form";

type OptionDraft = { id?: string; names: Names; deltaText: string; isDefault: boolean };
type GroupDraft = { id?: string; names: Names; required: boolean; options: OptionDraft[] };

const blankOption = (): OptionDraft => ({ names: emptyNames(), deltaText: "0", isDefault: false });

export function OptionGroupsEditor({ groups }: { groups: EditorGroup[] }) {
  const t = useTranslations("optionGroups");
  const tm = useTranslations("menu");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "failed" | "invalid">("idle");
  const wide = useMediaQuery("(min-width: 64rem)");

  function edit(g?: EditorGroup) {
    setStatus("idle");
    setDraft(
      g
        ? {
            id: g.id,
            names: g.names,
            required: g.minSelect > 0,
            options: g.options.map((o) => ({
              id: o.id,
              names: o.names,
              deltaText: String(o.priceDelta),
              isDefault: o.isDefault,
            })),
          }
        : { names: emptyNames(), required: true, options: [blankOption()] },
    );
  }

  function save() {
    if (!draft) return;
    const options = draft.options.map((o) => ({ ...o, priceDelta: parsePriceInput(o.deltaText) }));
    if (!draft.names.hy.trim() || options.some((o) => o.priceDelta === null || !o.names.hy.trim()))
      return setStatus("invalid");
    startTransition(async () => {
      const result = await saveOptionGroup({
        id: draft.id,
        names: draft.names,
        required: draft.required,
        options: options.map((o) => ({
          id: o.id,
          names: o.names,
          priceDelta: o.priceDelta as number,
          isDefault: o.isDefault,
        })),
      });
      if (!result.ok) return setStatus("failed");
      setDraft({ ...draft, id: result.id });
      setStatus("saved");
      router.refresh();
    });
  }

  const title = draft?.id ? draft.names[locale] || draft.names.hy || t("title") : t("add");

  const footer = draft && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="submit"
        form={FORM_ID}
        disabled={pending}
        className={button("primary", "min-w-32 flex-1 sm:flex-none")}
      >
        {tm("save")}
      </button>
      <p
        aria-live="polite"
        className={clsx(
          "m-0 basis-full text-[0.9375rem] font-semibold",
          status === "saved" ? "text-tarragon" : "text-pomegranate",
        )}
      >
        {status === "saved" && tm("saved")}
        {status === "failed" && tm("saveFailed")}
        {status === "invalid" && tm("nameRequired")}
      </p>
    </div>
  );

  const form = draft && (
    <form
      id={FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        {LOCALES.map((l) => (
          <label key={l} className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t(`groupName.${l}`)}</span>
            <input
              lang={l}
              value={draft.names[l]}
              maxLength={80}
              onChange={(e) => setDraft({ ...draft, names: { ...draft.names, [l]: e.target.value } })}
              className={input}
            />
          </label>
        ))}
      </div>
      <fieldset className="m-0 flex flex-col gap-1 rounded-2xl border-0 bg-white p-4">
        <label className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
          <input
            type="radio"
            name="required"
            className={check}
            checked={draft.required}
            onChange={() => setDraft({ ...draft, required: true })}
          />
          {t("required")}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
          <input
            type="radio"
            name="required"
            className={check}
            checked={!draft.required}
            onChange={() => setDraft({ ...draft, required: false })}
          />
          {t("optional")}
        </label>
      </fieldset>
      {draft.options.map((o, i) => (
        <fieldset
          key={o.id ?? `new-${i}`}
          className="m-0 flex min-w-0 flex-col gap-2 rounded-2xl border-0 bg-white p-4"
          data-testid="option-fieldset"
        >
          <legend className="float-left mb-1 w-full text-[0.9375rem] font-bold">
            {t("option")} {i + 1}
          </legend>
          {LOCALES.map((l) => (
            <input
              key={l}
              lang={l}
              aria-label={`${t("option")} ${i + 1}: ${tm(`name.${l}`)}`}
              placeholder={tm(`name.${l}`)}
              value={o.names[l]}
              maxLength={80}
              onChange={(e) => {
                const options = draft.options.slice();
                options[i] = { ...o, names: { ...o.names, [l]: e.target.value } };
                setDraft({ ...draft, options });
              }}
              className={input}
            />
          ))}
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("priceDelta")}</span>
            <input
              inputMode="numeric"
              aria-label={`${t("option")} ${i + 1}: ${t("priceDelta")}`}
              value={o.deltaText}
              onChange={(e) => {
                const options = draft.options.slice();
                options[i] = { ...o, deltaText: e.target.value };
                setDraft({ ...draft, options });
              }}
              className={clsx(input, "num")}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
              <input
                type="checkbox"
                className={check}
                checked={o.isDefault}
                onChange={(e) => {
                  const options = draft.options.map((x, k) => ({
                    ...x,
                    isDefault: k === i ? e.target.checked : false,
                  }));
                  setDraft({ ...draft, options });
                }}
              />
              {t("isDefault")}
            </label>
            {draft.options.length > 1 && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, options: draft.options.filter((_, k) => k !== i) })}
                className={button("danger", "min-h-11 text-[0.9375rem]")}
              >
                <Trash2 aria-hidden="true" className="!size-4" />
                {t("removeOption")}
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => setDraft({ ...draft, options: [...draft.options, blankOption()] })}
        className={button("tinted", "self-start")}
      >
        <Plus aria-hidden="true" />
        <span className="sr-only">+ </span>
        {t("addOption")}
      </button>
    </form>
  );

  return (
    <div
      className={clsx(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5",
        draft && wide && "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]",
      )}
    >
      <section className="flex min-w-0 flex-col gap-3">
        {groups.length === 0 ? (
          <p className="text-staff-label2 m-0 flex items-center gap-3 rounded-2xl bg-white px-4 py-6 text-[1.0625rem]">
            <SlidersHorizontal aria-hidden="true" className="size-5 shrink-0" />
            {t("empty")}
          </p>
        ) : (
          <ul className="m-0 list-none overflow-hidden rounded-2xl bg-white p-0">
            {groups.map((g) => (
              <li key={g.id} className="border-staff-sep border-b last:border-0">
                <button
                  type="button"
                  onClick={() => edit(g)}
                  className={clsx(
                    "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left",
                    draft?.id === g.id && "bg-staff-fill",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[1.0625rem] font-semibold break-words">
                      {g.names[locale] || g.names.hy}
                    </span>
                    <span className="text-staff-label2 text-[0.9375rem] break-words">
                      {g.options
                        .map(
                          (o) =>
                            `${o.names[locale] || o.names.hy}${o.priceDelta ? ` ${formatAmdChange(o.priceDelta, locale)}` : ""}`,
                        )
                        .join(", ")}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => edit()} className={button("primary", "self-start")}>
          <Plus aria-hidden="true" />
          <span className="sr-only">+ </span>
          {t("add")}
        </button>
      </section>

      {draft && wide && (
        <aside
          aria-label={title}
          className="admin-fade bg-staff-fill/60 ring-staff-sep flex min-w-0 flex-col self-start overflow-hidden rounded-2xl ring-1 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8.5rem)]"
        >
          <header className="border-staff-sep flex min-h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
            <h2 className="m-0 min-w-0 flex-1 truncate text-[1.0625rem] font-bold">{title}</h2>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label={tm("close")}
              className="bg-staff-fill text-staff-label2 inline-grid size-11 shrink-0 place-items-center rounded-full"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{form}</div>
          <footer className="border-staff-sep shrink-0 border-t bg-white px-4 py-3">{footer}</footer>
        </aside>
      )}
      {draft && !wide && (
        <Sheet title={title} closeLabel={tm("close")} onClose={() => setDraft(null)} footer={footer}>
          {form}
        </Sheet>
      )}
    </div>
  );
}

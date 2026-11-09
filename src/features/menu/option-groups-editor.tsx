"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import { saveOptionGroup } from "./actions";
import { parsePriceInput } from "./schema";
import { emptyNames, type EditorGroup, type Names } from "./types";

const LOCALES = ["hy", "ru", "en"] as const;
const field = "h-12 w-full rounded-input border border-line-strong bg-white px-3";

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

  function edit(g?: EditorGroup) {
    setStatus("idle");
    setDraft(
      g
        ? {
            id: g.id,
            names: g.names,
            required: g.minSelect > 0,
            options: g.options.map((o) => ({ id: o.id, names: o.names, deltaText: String(o.priceDelta), isDefault: o.isDefault })),
          }
        : { names: emptyNames(), required: true, options: [blankOption()] },
    );
  }

  function save() {
    if (!draft) return;
    const options = draft.options.map((o) => ({ ...o, priceDelta: parsePriceInput(o.deltaText) }));
    if (!draft.names.hy.trim() || options.some((o) => o.priceDelta === null || !o.names.hy.trim())) return setStatus("invalid");
    startTransition(async () => {
      const result = await saveOptionGroup({
        id: draft.id,
        names: draft.names,
        required: draft.required,
        options: options.map((o) => ({ id: o.id, names: o.names, priceDelta: o.priceDelta as number, isDefault: o.isDefault })),
      });
      if (!result.ok) return setStatus("failed");
      setDraft({ ...draft, id: result.id });
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
      <section className="flex flex-col gap-2">
        {groups.length === 0 && <p className="text-muted">{t("empty")}</p>}
        <ul>
          {groups.map((g) => (
            <li key={g.id} className="border-b border-line">
              <button type="button" onClick={() => edit(g)} className="flex min-h-14 w-full flex-col items-start py-2 text-left">
                <span className="font-semibold">{g.names[locale] || g.names.hy}</span>
                <span className="text-sm text-muted">
                  {g.options.map((o) => `${o.names[locale] || o.names.hy}${o.priceDelta ? ` +${formatAmd(o.priceDelta, locale)}` : ""}`).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => edit()} className="mt-2 min-h-12 self-start rounded-chip border border-dashed border-line-strong px-4 text-tarragon">
          + {t("add")}
        </button>
      </section>

      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-4 rounded-sheet border border-line bg-white p-5"
        >
          {LOCALES.map((l) => (
            <label key={l} className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-muted">{t(`groupName.${l}`)}</span>
              <input lang={l} value={draft.names[l]} maxLength={80} onChange={(e) => setDraft({ ...draft, names: { ...draft.names, [l]: e.target.value } })} className={field} />
            </label>
          ))}
          <fieldset className="flex flex-col gap-2">
            <label className="flex min-h-12 items-center gap-3">
              <input type="radio" name="required" className="size-5 accent-tarragon" checked={draft.required} onChange={() => setDraft({ ...draft, required: true })} />
              {t("required")}
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input type="radio" name="required" className="size-5 accent-tarragon" checked={!draft.required} onChange={() => setDraft({ ...draft, required: false })} />
              {t("optional")}
            </label>
          </fieldset>
          {draft.options.map((o, i) => (
            <fieldset key={o.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-chip border border-line p-3" data-testid="option-fieldset">
              <legend className="px-1 text-sm font-semibold text-muted">
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
                  className={field}
                />
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted">{t("priceDelta")}</span>
                <input
                  inputMode="numeric"
                  aria-label={`${t("option")} ${i + 1}: ${t("priceDelta")}`}
                  value={o.deltaText}
                  onChange={(e) => {
                    const options = draft.options.slice();
                    options[i] = { ...o, deltaText: e.target.value };
                    setDraft({ ...draft, options });
                  }}
                  className={`${field} num`}
                />
              </label>
              <div className="flex items-center justify-between">
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 accent-tarragon"
                    checked={o.isDefault}
                    onChange={(e) => {
                      const options = draft.options.map((x, k) => ({ ...x, isDefault: k === i ? e.target.checked : false }));
                      setDraft({ ...draft, options });
                    }}
                  />
                  {t("isDefault")}
                </label>
                {draft.options.length > 1 && (
                  <button type="button" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, k) => k !== i) })} className="min-h-12 px-3 text-pomegranate">
                    {t("removeOption")}
                  </button>
                )}
              </div>
            </fieldset>
          ))}
          <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, blankOption()] })} className="min-h-12 self-start rounded-chip border border-dashed border-line-strong px-4 text-tarragon">
            + {t("addOption")}
          </button>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon px-6 font-semibold text-white disabled:opacity-60">
              {tm("save")}
            </button>
            <p aria-live="polite" className={status === "saved" ? "text-tarragon" : "text-pomegranate"}>
              {status === "saved" && tm("saved")}
              {status === "failed" && tm("saveFailed")}
              {status === "invalid" && tm("nameRequired")}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

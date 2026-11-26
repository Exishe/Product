"use client";

import { clsx } from "clsx";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { button, chip, fieldLabel, input, textAction } from "@/features/admin-ui/styles";
import { deletePromo, savePromo, setPromoOn, type SaveResult } from "./actions";

type ErrorKey = Extract<SaveResult, { ok: false }>["error"];
import { LANGS, PROMO_LIMIT, isLiveNow, localNow, titleOf, validWindow, type Lang, type Promo } from "./model";

type Draft = {
  id: string | null;
  title: Record<Lang, string>;
  text: Record<Lang, string>;
  badge: string;
  startsAt: string;
  endsAt: string;
};

const blank = (): Draft => ({
  id: null,
  title: { hy: "", ru: "", en: "" },
  text: { hy: "", ru: "", en: "" },
  badge: "",
  startsAt: "",
  endsAt: "",
});
const draftOf = (p: Promo): Draft => ({
  id: p.id,
  title: { hy: p.title.hy ?? "", ru: p.title.ru ?? "", en: p.title.en ?? "" },
  text: { hy: p.text.hy ?? "", ru: p.text.ru ?? "", en: p.text.en ?? "" },
  badge: p.badge ?? "",
  startsAt: p.startsAt ?? "",
  endsAt: p.endsAt ?? "",
});

// Promotions (ADR-070): a short announcement at the top of the guest menu.
// The owner keeps up to three prepared and switches them on and off. Nothing
// here touches a price.
export function PromoManager({ initial, timeZone }: { initial: Promo[]; timeZone: string }) {
  const t = useTranslations("admin.promos");
  const [promos, setPromos] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [now, setNow] = useState(() => localNow(timeZone));
  const [pending, startTransition] = useTransition();
  const uid = useId();

  // A promo with dates starts or ends by itself: keep the words true.
  useEffect(() => {
    const timer = setInterval(() => setNow(localNow(timeZone)), 30_000);
    return () => clearInterval(timer);
  }, [timeZone]);

  function toggle(p: Promo) {
    setError(null);
    startTransition(async () => {
      const r = await setPromoOn(p.id, !p.isOn);
      if (!r.ok) return setError("failed");
      setNow(localNow(timeZone));
      setPromos((all) => all.map((x) => (x.id === p.id ? { ...x, isOn: !p.isOn } : x)));
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await deletePromo(id);
      if (!r.ok) return setError("failed");
      setConfirmDelete(null);
      setDraft(null);
      setPromos((all) => all.filter((x) => x.id !== id));
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    if (!draft.title.hy.trim()) return setError("title");
    if (!validWindow(draft.startsAt || null, draft.endsAt || null)) return setError("window");
    const d = draft;
    startTransition(async () => {
      const r = await savePromo({
        id: d.id,
        title: d.title,
        text: d.text,
        badge: d.badge.trim() || null,
        startsAt: d.startsAt || null,
        endsAt: d.endsAt || null,
      });
      if (!r.ok) return setError(r.error);
      const lines = (v: Record<Lang, string>) =>
        Object.fromEntries(LANGS.flatMap((l) => (v[l].trim() ? [[l, v[l].trim()]] : [])));
      const next: Promo = {
        id: r.id,
        title: lines(d.title),
        text: lines(d.text),
        badge: d.badge.trim() || null,
        isOn: promos.find((x) => x.id === r.id)?.isOn ?? false,
        startsAt: d.startsAt || null,
        endsAt: d.endsAt || null,
      };
      setPromos((all) => (d.id ? all.map((x) => (x.id === r.id ? next : x)) : [...all, next]));
      setDraft(null);
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const full = promos.length >= PROMO_LIMIT;

  return (
    <div className="flex flex-col gap-4" data-testid="promo-manager">
      {promos.length === 0 && !draft && <p className="text-staff-label2 m-0 text-name">{t("empty")}</p>}

      {promos.length > 0 && (
        <ul className="border-staff-sep m-0 flex list-none flex-col border-t p-0">
          {promos.map((p) => {
            const live = isLiveNow(p, now);
            const title = titleOf(p);
            // "15:00–17:00" as a badge repeats a title that already says it.
            const badge = p.badge && !title.includes(p.badge) ? p.badge : null;
            return (
              <li key={p.id} className="border-staff-sep flex items-start gap-3 border-b py-3" data-testid="promo-row">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="m-0 text-name font-semibold [overflow-wrap:anywhere]" data-testid="promo-row-title">
                    {title}
                    {badge && <span className={clsx(chip.base, chip.plain, "ml-2 align-middle")}>{badge}</span>}
                  </p>
                  <p
                    className={clsx("m-0 text-label", live ? "text-tarragon font-semibold" : "text-staff-label2")}
                    role="status"
                    data-testid="promo-status"
                  >
                    {live ? t("statusLive") : p.isOn ? t("statusWaiting") : t("statusOff")}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setConfirmDelete(null);
                      setDraft(draftOf(p));
                    }}
                    className={textAction("ink", "-ml-2 w-fit underline underline-offset-4")}
                  >
                    <Pencil aria-hidden="true" />
                    {t("edit")}
                  </button>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.isOn}
                  aria-label={t("switchLabel", { title })}
                  disabled={pending}
                  onClick={() => toggle(p)}
                  data-testid="promo-switch"
                  className="group -m-1 grid min-h-11 min-w-14 flex-none place-items-center p-1 disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "relative h-8 w-14 rounded-full transition-colors duration-150",
                      p.isOn ? "bg-tarragon" : "bg-staff-field",
                    )}
                  >
                    <span
                      className={clsx(
                        "absolute top-1 size-6 rounded-full bg-white shadow transition-[left] duration-150",
                        p.isOn ? "left-7" : "left-1",
                      )}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {draft ? (
        <form
          className="flex max-w-[40rem] flex-col gap-4"
          data-testid="promo-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h3 className="m-0 text-name font-semibold">{draft.id ? t("editTitle") : t("newTitle")}</h3>
          <p className="text-staff-label2 -mt-2 mb-0 text-label">{t("requiredNote")}</p>
          {LANGS.map((l) => (
            <label key={`t-${l}`} htmlFor={`${uid}-t-${l}`} className="flex flex-col gap-1.5">
              <span className={fieldLabel}>
                {t("titleLabel", { lang: t(`lang.${l}`) })}
                
              </span>
              <input
                id={`${uid}-t-${l}`}
                value={draft.title[l]}
                maxLength={80}
                lang={l}
                required={l === "hy"}
                autoComplete="off"
                onChange={(e) => set({ title: { ...draft.title, [l]: e.target.value } })}
                className={input}
                data-testid={`promo-title-${l}`}
              />
            </label>
          ))}
          {LANGS.map((l) => (
            <label key={`x-${l}`} htmlFor={`${uid}-x-${l}`} className="flex flex-col gap-1.5">
              <span className={fieldLabel}>
                {t("textLabel", { lang: t(`lang.${l}`) })}
              </span>
              <input
                id={`${uid}-x-${l}`}
                value={draft.text[l]}
                maxLength={160}
                lang={l}
                autoComplete="off"
                onChange={(e) => set({ text: { ...draft.text, [l]: e.target.value } })}
                className={input}
              />
            </label>
          ))}
          <label htmlFor={`${uid}-badge`} className="flex flex-col gap-1.5 sm:max-w-48">
            <span className={fieldLabel}>
              {t("badgeLabel")}
            </span>
            <input
              id={`${uid}-badge`}
              value={draft.badge}
              maxLength={16}
              autoComplete="off"
              onChange={(e) => set({ badge: e.target.value })}
              className={input}
              data-testid="promo-badge-input"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor={`${uid}-start`} className="flex min-w-0 flex-col gap-1.5">
              <span className={fieldLabel}>
                {t("startsLabel")}
              </span>
              <input
                id={`${uid}-start`}
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => set({ startsAt: e.target.value })}
                className={input}
              />
            </label>
            <label htmlFor={`${uid}-end`} className="flex min-w-0 flex-col gap-1.5">
              <span className={fieldLabel}>
                {t("endsLabel")}
              </span>
              <input
                id={`${uid}-end`}
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => set({ endsAt: e.target.value })}
                className={input}
              />
            </label>
          </div>
          <p className="text-staff-label2 m-0 text-label">{t("windowHint")}</p>
          {error && (
            <p role="alert" className="text-pomegranate m-0 text-label font-semibold">
              {t(`error.${error}`)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={button("primary", "flex-1 sm:flex-none")} data-testid="promo-save">
              {t("save")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className={button("secondary", "flex-1 sm:flex-none")}
            >
              {t("cancel")}
            </button>
            {/* Delete lives in the editor, away from the everyday switch. */}
            {draft.id && confirmDelete !== draft.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDelete(draft.id)}
                className={textAction("danger", "sm:ml-auto")}
              >
                <Trash2 aria-hidden="true" />
                {t("delete")}
              </button>
            )}
          </div>
          {draft.id && confirmDelete === draft.id && (
            <div className="border-staff-sep flex flex-col gap-2 border-t pt-4">
              <p className="m-0 text-name">{t("deleteConfirm", { title: draft.title.hy || draft.title.ru || draft.title.en })}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => draft.id && remove(draft.id)}
                  className={button("destructive", "flex-1 sm:flex-none")}
                >
                  {t("deleteYes")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmDelete(null)}
                  className={button("secondary", "flex-1 sm:flex-none")}
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <button
              type="button"
              disabled={pending || full}
              onClick={() => {
                setError(null);
                setDraft(blank());
              }}
              className={button("secondary", "w-full sm:w-auto")}
              data-testid="promo-add"
            >
              <Plus aria-hidden="true" />
              {t("add")}
            </button>
          </div>
          {full && <p className="text-staff-label2 m-0 text-label">{t("limit", { count: PROMO_LIMIT })}</p>}
        </div>
      )}

      {!draft && error && (
        <p role="alert" className="text-pomegranate m-0 text-label font-semibold">
          {t(`error.${error}`)}
        </p>
      )}
    </div>
  );
}

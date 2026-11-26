"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { button, fieldLabel, field, input } from "@/features/admin-ui/styles";
import { saveGameRewards } from "./actions";
import {
  GAME_IDS,
  LEVEL_RANGE,
  PERCENT_RANGE,
  problems,
  sameSettings,
  type GameChoice,
  type RewardSettings,
} from "./model";

const whole = (v: string): number => (/^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : NaN);
const LANGS = [
  ["hy", "textHy"],
  ["ru", "textRu"],
  ["en", "textEn"],
] as const;

// Game rewards (ADR-075) in the owner's words: a switch, what the guest gets,
// from which level, in which game. One Save button; nothing changes until it is
// pressed. Rewards never touch a price: the waiter gives them.
export function RewardsForm({ initial }: { initial: RewardSettings }) {
  const t = useTranslations("admin.rewards");
  const [saved, setSaved] = useState(initial);
  const [on, setOn] = useState(initial.on);
  const [kind, setKind] = useState(initial.kind);
  const [level, setLevel] = useState(String(initial.level));
  const [percent, setPercent] = useState(initial.percent === null ? "" : String(initial.percent));
  const [text, setText] = useState({ hy: "", ru: "", en: "", ...initial.text });
  const [game, setGame] = useState<GameChoice | "">(initial.game ?? "");
  const [result, setResult] = useState<"idle" | "ok" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const uid = useId();

  const draft: RewardSettings = {
    on,
    kind,
    level: whole(level),
    percent: percent === "" ? null : whole(percent),
    text: Object.fromEntries(Object.entries(text).filter(([, v]) => v.trim())),
    game: game || null,
  };
  const bad = problems(draft);
  const changed = !sameSettings(draft, saved);
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setResult("idle");
  };

  function save() {
    if (bad.length > 0 || !changed) return;
    setResult("idle");
    startTransition(async () => {
      const ok = await saveGameRewards(draft);
      if (ok) setSaved(draft);
      setResult(ok ? "ok" : "failed");
    });
  }

  const hintClass = (isBad: boolean) =>
    isBad ? "text-pomegranate text-[0.9375rem] font-semibold" : "text-staff-label2 text-[0.9375rem]";

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="rewards-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-[1.0625rem] font-semibold" role="status" data-testid="rewards-status">
          {saved.on ? t("on") : t("off")}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={on ? t("turnOff") : t("turnOn")}
          onClick={() => edit(setOn)(!on)}
          data-testid="rewards-switch"
          className="group -m-1 grid min-h-11 min-w-14 flex-none place-items-center p-1"
        >
          <span
            aria-hidden="true"
            className={clsx("relative h-8 w-14 rounded-full transition-colors duration-150", on ? "bg-tarragon" : "bg-staff-field")}
          >
            <span
              className={clsx(
                "absolute top-1 size-6 rounded-full bg-white shadow transition-[left] duration-150",
                on ? "left-7" : "left-1",
              )}
            />
          </span>
        </button>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className={clsx(fieldLabel, "mb-1.5 p-0")}>{t("kind")}</legend>
        {/* The same grey-track segmented pair as guest ordering and the staff
            role: both choices on screen, the chosen one white. */}
        <div className="bg-staff-fill flex gap-1 rounded-full p-1 sm:grid sm:max-w-md sm:grid-cols-2">
          {(["percent", "text"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => edit(setKind)(k)}
              data-testid={`rewards-kind-${k}`}
              className={clsx(
                "flex min-h-11 min-w-0 flex-auto items-center justify-center rounded-full px-3 text-label font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
                kind === k ? "text-ink bg-white shadow-sm" : "text-staff-label2 hover:text-ink",
              )}
            >
              <span className="truncate">{t(k === "percent" ? "kindPercent" : "kindText")}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor={`${uid}-level`} className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("level")}</span>
        <input
          id={`${uid}-level`}
          inputMode="numeric"
          autoComplete="off"
          value={level}
          onChange={(e) => edit(setLevel)(e.target.value)}
          aria-invalid={bad.includes("level")}
          aria-describedby={`${uid}-level-hint`}
          className={clsx(input, "num sm:max-w-40")}
          data-testid="rewards-level"
        />
        <span id={`${uid}-level-hint`} className={hintClass(bad.includes("level"))}>
          {t("levelHint", LEVEL_RANGE)}
        </span>
      </label>

      {kind === "percent" ? (
        <label htmlFor={`${uid}-percent`} className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("percent")}</span>
          <input
            id={`${uid}-percent`}
            inputMode="numeric"
            autoComplete="off"
            value={percent}
            onChange={(e) => edit(setPercent)(e.target.value)}
            aria-invalid={bad.includes("percent")}
            aria-describedby={`${uid}-percent-hint`}
            className={clsx(input, "num sm:max-w-40")}
            data-testid="rewards-percent"
          />
          <span id={`${uid}-percent-hint`} className={hintClass(bad.includes("percent"))}>
            {t("percentHint", PERCENT_RANGE)}
          </span>
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <p className={clsx(hintClass(bad.includes("tooLong")), "m-0")}>{t("textHint")}</p>
          {LANGS.map(([lang, label]) => (
            <label key={lang} htmlFor={`${uid}-${lang}`} className="flex flex-col gap-1.5">
              <span className={fieldLabel}>{t(label)}</span>
              <input
                id={`${uid}-${lang}`}
                lang={lang}
                autoComplete="off"
                value={text[lang]}
                onChange={(e) => edit(setText)({ ...text, [lang]: e.target.value })}
                aria-invalid={lang === "hy" && bad.includes("text")}
                className={input}
                data-testid={`rewards-text-${lang}`}
              />
            </label>
          ))}
        </div>
      )}

      <label htmlFor={`${uid}-game`} className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("game")}</span>
        <select
          id={`${uid}-game`}
          value={game}
          onChange={(e) => edit(setGame)(e.target.value as GameChoice | "")}
          className={clsx(field, "h-12 sm:max-w-72")}
          data-testid="rewards-game"
        >
          <option value="">{t("gameAny")}</option>
          {GAME_IDS.map((g) => (
            <option key={g} value={g}>
              {t(`games.${g}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || bad.length > 0 || !changed}
          className={button("primary", "w-full sm:w-auto")}
          data-testid="rewards-save"
        >
          {t("save")}
        </button>
        <p role="status" className="m-0 text-[0.9375rem] font-semibold">
          {result === "ok" && <span className="text-tarragon">{t("saved")}</span>}
          {result === "failed" && <span className="text-pomegranate">{t("failed")}</span>}
          {result === "idle" && bad.length > 0 && <span className="text-pomegranate">{t("invalid")}</span>}
        </p>
      </div>
    </form>
  );
}

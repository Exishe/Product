"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { check } from "@/features/admin-ui/styles";
import { setOutIngredientDisplay } from "./ingredient-actions";

type Mode = "hide" | "sold_out";

// The owner's choice for a dish that needs an out ingredient and has no
// replacement (ADR-076): hidden from the guest menu, or shown as sold out.
export function OutIngredientSetting({ initial }: { initial: Mode }) {
  const t = useTranslations("menu.ingredients");
  const groupId = useId();
  const [mode, setMode] = useState<Mode>(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function choose(next: Mode) {
    const previous = mode;
    setMode(next);
    setStatus("idle");
    startTransition(async () => {
      const res = await setOutIngredientDisplay(next);
      if (res.ok) return setStatus("saved");
      setMode(previous);
      setStatus("failed");
    });
  }

  const options: { value: Mode; label: string }[] = [
    { value: "hide", label: t("displayHide") },
    { value: "sold_out", label: t("displaySoldOut") },
  ];

  return (
    <fieldset
      aria-describedby={`${groupId}-hint`}
      data-testid="out-ingredient-setting"
      className="m-0 mb-4 flex min-w-0 flex-col gap-2 rounded-2xl border-0 bg-white p-4"
    >
      <legend className="float-left mb-1 w-full text-[0.9375rem] font-bold">{t("displayTitle")}</legend>
      <p id={`${groupId}-hint`} className="text-staff-label2 m-0 text-[0.9375rem]">
        {t("displayHint")}
      </p>
      <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-3 text-[1.0625rem]">
            <input
              type="radio"
              name={groupId}
              value={o.value}
              checked={mode === o.value}
              disabled={pending}
              onChange={() => choose(o.value)}
              className={check}
            />
            {o.label}
          </label>
        ))}
      </div>
      {status !== "idle" && (
        <p
          role="status"
          className={
            status === "saved"
              ? "text-tarragon m-0 text-[0.9375rem] font-semibold"
              : "text-pomegranate m-0 text-[0.9375rem] font-semibold"
          }
        >
          {status === "saved" ? t("displaySaved") : t("displayFailed")}
        </p>
      )}
    </fieldset>
  );
}

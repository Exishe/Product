"use client";

import { clsx } from "clsx";
import { input } from "@/features/admin-ui/styles";
import { toDisplayDate } from "./range";

// Armenian and Russian write dates as dd.mm.yyyy, which a native date input
// shows in the browser's own order. So hy and ru get a plain text field the
// server reads (parseDateInput); English keeps the native picker.
export function DateField({
  name,
  value,
  min,
  max,
  locale,
}: {
  name: string;
  value: string;
  min?: string;
  max: string;
  locale: string;
}) {
  if (locale === "en") {
    return (
      <input
        type="date"
        name={name}
        defaultValue={value}
        min={min}
        max={max}
        className={clsx(input, "num h-11 w-auto")}
      />
    );
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      name={name}
      defaultValue={toDisplayDate(value)}
      placeholder="dd.mm.yyyy"
      maxLength={10}
      pattern="\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{4}"
      className={clsx(input, "num h-11 w-36")}
    />
  );
}

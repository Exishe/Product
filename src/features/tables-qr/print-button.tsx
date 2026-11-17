"use client";

import { Printer } from "lucide-react";
import { button } from "@/features/admin-ui/styles";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={button("primary")}>
      <Printer aria-hidden="true" />
      {label}
    </button>
  );
}

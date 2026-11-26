"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { button } from "@/features/admin-ui/styles";
import { setOrdersTest } from "./actions";

type Ask = "exclude" | "include" | null;

// Lets the owner take a demo café's old test orders out of the numbers (and
// put them back). Two steps, because it changes many orders at once.
export function TestDataPanel({ from, to, period }: { from: string; to: string; period: string }) {
  const t = useTranslations("dashboard.testData");
  const router = useRouter();
  const [ask, setAsk] = useState<Ask>(null);
  const [result, setResult] = useState<
    { kind: "done"; orders: number; excluded: boolean } | { kind: "failed" } | null
  >(null);
  const [pending, startTransition] = useTransition();

  function run(excluded: boolean) {
    startTransition(async () => {
      const r = await setOrdersTest({ from, to, isTest: excluded });
      setAsk(null);
      if (!r.ok) return setResult({ kind: "failed" });
      setResult({ kind: "done", orders: r.orders, excluded });
      router.refresh();
    });
  }

  return (
    <details className="group border-staff-sep border-t" data-testid="test-data-panel">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 text-name font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{t("title")}</span>
        <ChevronDown
          aria-hidden="true"
          className="text-staff-label2 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-3 pb-4">
        <p className="text-staff-label2 m-0 text-label">{t("hint", { period })}</p>
        {ask ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-name font-semibold">
              {ask === "exclude" ? t("confirmExclude", { period }) : t("confirmInclude", { period })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(ask === "exclude")}
                className={button("primary")}
                data-testid="test-data-confirm"
              >
                {ask === "exclude" ? t("exclude") : t("include")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setAsk(null)}
                className={button("secondary")}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAsk("exclude")}
              className={button("secondary", "min-h-11 text-label")}
              data-testid="test-data-exclude"
            >
              {t("exclude")}
            </button>
            <button
              type="button"
              onClick={() => setAsk("include")}
              className={button("secondary")}
            >
              {t("include")}
            </button>
          </div>
        )}
        <p role="status" className="m-0 text-label font-semibold">
          {result?.kind === "done"
            ? t(result.excluded ? "doneExcluded" : "doneIncluded", { count: result.orders })
            : result?.kind === "failed"
              ? t("failed")
              : ""}
        </p>
      </div>
    </details>
  );
}

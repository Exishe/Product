import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

const STEPS = ["photo", "reading", "review", "publish"] as const;
export type Step = (typeof STEPS)[number];

// The four steps of the import, with the current one marked for screen readers.
export function ImportSteps({ current }: { current: Step }) {
  const t = useTranslations("menuImport.steps");
  const at = STEPS.indexOf(current);
  return (
    <ol
      aria-label={t("label")}
      className="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-2 p-0 text-[0.9375rem]"
    >
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === at ? "step" : undefined}
          className={`flex min-h-9 items-center gap-2 rounded-full py-1 pr-3.5 pl-1 font-semibold ${
            i === at
              ? "bg-tarragon text-white"
              : i < at
                ? "bg-tarragon-tint text-tarragon"
                : "text-staff-label2 bg-white"
          }`}
        >
          <span
            aria-hidden="true"
            className={`num grid size-7 place-items-center rounded-full text-[0.8125rem] ${
              i === at ? "bg-white/20" : i < at ? "bg-white" : "bg-staff-fill"
            }`}
          >
            {i < at ? <Check className="size-4" /> : i + 1}
          </span>
          {t(step)}
        </li>
      ))}
    </ol>
  );
}

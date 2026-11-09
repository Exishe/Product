import { useTranslations } from "next-intl";

const STEPS = ["photo", "reading", "review", "publish"] as const;
export type Step = (typeof STEPS)[number];

// The four steps of the import, with the current one marked for screen readers.
export function ImportSteps({ current }: { current: Step }) {
  const t = useTranslations("menuImport.steps");
  const at = STEPS.indexOf(current);
  return (
    <ol aria-label={t("label")} className="flex flex-wrap gap-x-1 gap-y-2 text-sm">
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === at ? "step" : undefined}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
            i === at
              ? "bg-tarragon font-semibold text-white"
              : i < at
                ? "bg-tarragon-tint text-tarragon"
                : "text-muted border-line border"
          }`}
        >
          <span aria-hidden="true" className="num">
            {i + 1}
          </span>
          {t(step)}
        </li>
      ))}
    </ol>
  );
}

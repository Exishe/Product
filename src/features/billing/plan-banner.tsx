import { getTranslations } from "next-intl/server";
import { formatAmd } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { planState, SERVICE_PRICE_AMD, type PlanState } from "./plan";

const TONE: Record<Exclude<PlanState["kind"], "active">, string> = {
  trial: "border-tarragon bg-tarragon-tint",
  past_due: "border-apricot-deep bg-[#fce8c8]",
  trial_ended: "border-pomegranate bg-pom-tint",
  ordering_off: "border-pomegranate bg-pom-tint",
  menu: "border-line-strong bg-mist",
};

// What the owner needs to know about the plan (ADR-036). Subscriptions are
// readable by owners only (RLS), so managers see nothing here.
export async function PlanBanner({ restaurantId, locale }: { restaurantId: string; locale: Locale }) {
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, status, trial_ends_at, current_period_end")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!sub) return null;
  const state = planState(sub, new Date());
  if (state.kind === "active") return null;

  const t = await getTranslations("billing");
  const price = formatAmd(SERVICE_PRICE_AMD, locale);
  const text =
    state.kind === "trial"
      ? t("trial", { days: state.daysLeft, price })
      : state.kind === "past_due"
        ? t("pastDue", { days: state.daysLeft })
        : state.kind === "menu"
          ? t("menu", { price })
          : t(state.kind === "trial_ended" ? "trialEnded" : "orderingOff");
  const urgent = state.kind !== "trial" || state.daysLeft <= 5;

  return (
    <div
      role={urgent ? "status" : undefined}
      data-testid="plan-banner"
      data-plan={state.kind}
      className={`rounded-sheet flex flex-col gap-1 border-l-4 px-4 py-3 ${TONE[state.kind]}`}
    >
      <p className="font-semibold">{text}</p>
      {state.kind !== "trial" || urgent ? <p className="text-muted text-sm">{t("howToPay")}</p> : null}
    </div>
  );
}

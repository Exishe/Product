import { BookOpen, CircleAlert, Gift, Hourglass, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatAmd } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { planState, SERVICE_PRICE_AMD, type PlanState } from "./plan";

// Colour, icon and words together (ADR-055): never colour alone.
const TONE: Record<Exclude<PlanState["kind"], "active">, { box: string; icon: LucideIcon }> = {
  trial: { box: "bg-tarragon-tint [&>svg]:text-tarragon", icon: Gift },
  past_due: { box: "bg-[#fdf0dc] [&>svg]:text-amber-text", icon: Hourglass },
  trial_ended: { box: "bg-pom-tint [&>svg]:text-pomegranate", icon: CircleAlert },
  ordering_off: { box: "bg-pom-tint [&>svg]:text-pomegranate", icon: CircleAlert },
  menu: { box: "bg-white [&>svg]:text-staff-label2", icon: BookOpen },
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
  const tone = TONE[state.kind];

  return (
    <div
      role={urgent ? "status" : undefined}
      data-testid="plan-banner"
      data-plan={state.kind}
      className={`text-ink flex items-start gap-3 rounded-2xl px-4 py-3 ${tone.box}`}
    >
      <tone.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="m-0 text-[1.0625rem] font-semibold">{text}</p>
        {state.kind !== "trial" || urgent ? (
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("howToPay")}</p>
        ) : null}
      </div>
    </div>
  );
}

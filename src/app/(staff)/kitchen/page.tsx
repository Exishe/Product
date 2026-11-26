import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_STATION_NAME = "Kitchen";

// A bookmarked or typed /kitchen (no station): a kitchen login goes to its own
// station, a café with one station to that one, and an owner or manager with
// several picks one here. Read through RLS with the caller's session.
export default async function KitchenHome() {
  const me = await requireMember(["kitchen", "owner", "manager"], { deviceScreen: true });
  const supabase = await createClient();

  const { data: staff } = await supabase.schema("api").rpc("my_staff_login");
  if (staff && typeof staff === "object" && !Array.isArray(staff) && typeof staff.station_id === "string")
    redirect(`/kitchen/${staff.station_id}`);

  const { data: stations } = await supabase
    .from("stations")
    .select("id, name, is_default, sort")
    .eq("restaurant_id", me.restaurantId)
    .order("is_default", { ascending: false })
    .order("sort")
    .order("name");
  const list = stations ?? [];
  if (list.length === 0) notFound();
  if (list.length === 1 && list[0]) redirect(`/kitchen/${list[0].id}`);

  const t = await getTranslations("kitchen");
  const name = (s: { name: string; is_default: boolean }) =>
    s.is_default && s.name === SYSTEM_STATION_NAME ? t("title") : s.name;
  return (
    <main className="staff-shell bg-staff-bg text-ink grid min-h-dvh content-start justify-items-center px-4 py-10">
      <div className="grid w-full max-w-md gap-4">
        <h1 className="m-0 text-[1.75rem] leading-tight font-semibold">{t("stations")}</h1>
        <ul className="m-0 grid list-none p-0">
          {list.map((s) => (
            <li key={s.id} className="border-staff-sep border-b">
              <Link
                href={`/kitchen/${s.id}`}
                className="flex min-h-16 items-center justify-between gap-3 text-[1.25rem] font-semibold"
              >
                {name(s)}
                <ChevronRight aria-hidden="true" className="text-staff-label2 size-6 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { fetchSoldOut } from "@/features/kitchen/board-data";
import { buildGuestMenu, type PublicMenu } from "@/features/menu/guest-menu/view-model";
import { fetchFloor } from "@/features/waiter/floor-data";
import { WaiterApp } from "@/features/waiter/waiter-app";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/require-member";
import { vapidPublicKeyOrNull } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// The live part of the first paint, with the time it was read.
async function loadFloor(supabase: Client, location: { id: string; published_menu_version_id: string | null }) {
  const renderedAt = Date.now();
  const [floor, snapshot, soldOut] = await Promise.all([
    fetchFloor(supabase, location.id),
    location.published_menu_version_id
      ? supabase.from("menu_versions").select("snapshot").eq("id", location.published_menu_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchSoldOut(supabase, location.id, new Date(renderedAt)),
  ]);
  return { renderedAt, floor, snapshot, soldOut };
}

// The waiter tablet (screens.md §5–6): waiter devices, owners and managers.
// The location is the first one of the café this member may see (a waiter
// device is paired to one). Everything is read through RLS with the caller's
// own session (ADR-038).
export default async function WaiterPage() {
  const me = await requireMember(["waiter", "owner", "manager"], { deviceScreen: true });
  const supabase = await createClient();
  const locale = (await getLocale()) as Locale;

  const [{ data: restaurant }, { data: locations }] = await Promise.all([
    supabase.from("restaurants").select("name").eq("id", me.restaurantId).maybeSingle(),
    supabase
      .from("locations")
      .select("id, name, timezone, guest_locales, published_menu_version_id")
      .eq("restaurant_id", me.restaurantId)
      .order("created_at")
      .limit(1),
  ]);
  const location = locations?.[0];
  if (!location) throw new Error("waiter: no location visible to this member");

  const { renderedAt, floor, snapshot, soldOut } = await loadFloor(supabase, location);

  const menu = snapshot.data?.snapshot
    ? buildGuestMenu(
        {
          restaurant: { name: restaurant?.name ?? "" },
          location: { id: location.id, name: location.name, locales: location.guest_locales, ordering: true },
          menu: snapshot.data.snapshot as unknown as PublicMenu["menu"],
          sold_out: soldOut.ok ? soldOut.data : [],
          kitchen_busy: null,
        },
        locale,
      ).categories
    : [];

  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} timeZone={location.timezone} messages={{ waiter: messages.waiter }}>
      <WaiterApp
        cafeName={restaurant?.name ?? ""}
        location={{ id: location.id, timeZone: location.timezone }}
        initialRows={floor.ok && floor.data ? floor.data : { areas: [], tables: [], sessions: [], requests: [], stations: [] }}
        menu={menu}
        renderedAt={renderedAt}
        memberId={me.id}
        restaurantId={me.restaurantId}
        vapidPublicKey={vapidPublicKeyOrNull(process.env)}
        role={me.role}
        isDevice={me.kind === "device"}
        canManageTables={me.role === "owner" || me.role === "manager"}
      />
    </NextIntlClientProvider>
  );
}

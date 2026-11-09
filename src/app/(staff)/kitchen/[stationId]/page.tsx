import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { fetchSoldOut, fetchTicketRows } from "@/features/kitchen/board-data";
import { toBoardTickets } from "@/features/kitchen/board-model";
import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { stationDishes } from "@/features/kitchen/station-dishes";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The station the system creates with every café is called "Kitchen"; it is
// shown in the screen's language. Stations the owner named keep their name.
const SYSTEM_STATION_NAME = "Kitchen";

// Everything the first paint needs, read through RLS with the caller's own
// session. Null when the station doesn't exist or isn't the caller's.
async function loadBoard(stationId: string) {
  const supabase = await createClient();
  const { data: station } = await supabase
    .from("stations")
    .select(
      "id, name, is_default, location_id, locations(id, restaurant_id, timezone, kitchen_locale, business_day_starts, kitchen_busy_until, expected_wait_minutes, published_menu_version_id)",
    )
    .eq("id", stationId)
    .maybeSingle();
  const location = station?.locations;
  if (!station || !location) return null;

  const renderedAt = Date.now();
  const [claims, stations, rows, soldOut, links, menu] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("stations").select("id, name, is_default, sort").eq("location_id", location.id).order("sort").order("name"),
    fetchTicketRows(supabase, station.id),
    fetchSoldOut(supabase, location.id, new Date(renderedAt)),
    supabase.from("station_prep_areas").select("prep_area_id, station_id").eq("location_id", location.id),
    location.published_menu_version_id
      ? supabase.from("menu_versions").select("snapshot").eq("id", location.published_menu_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const userId = claims.data?.claims.sub;
  if (!userId) return null;
  return {
    station,
    location,
    stations: stations.data ?? [],
    rows: rows.ok ? rows.data : [],
    soldOut: soldOut.ok ? soldOut.data : [],
    links: links.data ?? [],
    snapshot: menu.data?.snapshot ?? null,
    renderedAt,
    userId,
  };
}

// Kitchen board for one station (screens.md §7): kitchen devices, owners and
// managers of the location. Dish names and the screen's language follow
// locations.kitchen_locale (i18n.md).
export default async function KitchenPage({ params }: { params: Promise<{ stationId: string }> }) {
  const me = await requireMember(["kitchen", "owner", "manager"], { deviceScreen: true });
  const { stationId } = await params;
  const board = UUID.test(stationId) ? await loadBoard(stationId) : null;
  if (!board) notFound();
  const { station, location } = board;

  const locale = location.kitchen_locale;
  const t = await getTranslations({ locale, namespace: "kitchen" });
  const messages = await getMessages({ locale });
  const title = (s: { name: string; is_default: boolean }) => (s.is_default && s.name === SYSTEM_STATION_NAME ? t("title") : s.name);

  return (
    <NextIntlClientProvider locale={locale} timeZone={location.timezone} messages={{ kitchen: messages.kitchen }}>
      <KitchenBoard
        station={{ id: station.id, title: title(station) }}
        otherStations={board.stations.filter((s) => s.id !== station.id).map((s) => ({ id: s.id, title: title(s) }))}
        location={{
          id: location.id,
          restaurantId: location.restaurant_id,
          timeZone: location.timezone,
          businessDayStarts: location.business_day_starts,
        }}
        initialTickets={toBoardTickets(board.rows, locale)}
        initialBusy={{ until: location.kitchen_busy_until, minutes: location.expected_wait_minutes }}
        initialSoldOut={board.soldOut}
        dishes={stationDishes(board.snapshot, board.links, { id: station.id, isDefault: station.is_default }, locale)}
        renderedAt={board.renderedAt}
        userId={board.userId}
        memberId={me.id}
        isDevice={me.kind === "device"}
      />
    </NextIntlClientProvider>
  );
}

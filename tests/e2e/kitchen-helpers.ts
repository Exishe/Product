import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database";
import type { Json } from "../../src/lib/supabase/types";
import { ownerEmail, ownerPassword, unique } from "./helpers";

// Helpers for the kitchen board specs: the demo owner acts through the same
// api.* functions the waiter tablet will use (never SQL, never a secret key),
// and test orders are served at the end so the demo kitchen stays clean.

export type Api = SupabaseClient<Database>;

export function newClient(): Api {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signedInOwner(email = ownerEmail as string, password = ownerPassword as string): Promise<Api> {
  const api = newClient();
  const { error } = await api.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return api;
}

type MenuItem = { id: string; name: Record<string, string>; groups: { min: number; modifiers: { id: string }[] }[] };

export type Cafe = {
  restaurantId: string;
  locationId: string;
  kitchenStationId: string;
  tables: Map<string, string>;
  kitchenItems: MenuItem[];
};

// Ids of a café's kitchen station, tables and the dishes that go to the kitchen.
export async function loadCafe(api: Api, slug: string): Promise<Cafe> {
  const { data: r, error } = await api
    .from("restaurants")
    .select("id, locations(id, published_menu_version_id)")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  const location = r.locations[0];
  if (!location?.published_menu_version_id) throw new Error(`${slug} has no published menu`);
  const [stations, tables, menu, links] = await Promise.all([
    api.from("stations").select("id, is_default").eq("location_id", location.id),
    api.from("tables").select("id, label").eq("location_id", location.id),
    api.from("menu_versions").select("snapshot").eq("id", location.published_menu_version_id).single(),
    api.from("station_prep_areas").select("prep_area_id, station_id").eq("location_id", location.id),
  ]);
  const kitchen = stations.data?.find((s) => s.is_default);
  if (!kitchen) throw new Error("no default station");
  const items = (menu.data?.snapshot as { items: Record<string, Omit<MenuItem, "id"> & { prep_area_id: string | null }> }).items;
  const stationOf = new Map((links.data ?? []).map((l) => [l.prep_area_id, l.station_id]));
  return {
    restaurantId: r.id,
    locationId: location.id,
    kitchenStationId: kitchen.id,
    tables: new Map((tables.data ?? []).map((t) => [t.label, t.id])),
    kitchenItems: Object.entries(items)
      .filter(([, it]) => ((it.prep_area_id && stationOf.get(it.prep_area_id)) || kitchen.id) === kitchen.id)
      .map(([id, it]) => ({ id, name: it.name, groups: it.groups ?? [] })),
  };
}

export const simpleItems = (cafe: Cafe) => cafe.kitchenItems.filter((i) => i.groups.length === 0);

export type Line = { item: MenuItem; quantity: number; note?: string };

export type PlacedOrder = { orderId: string; number: number; ticketId: string; placedAt: number; returnedAt: number };

// A waiter order through api.place_waiter_order (auto-accepted, so the kitchen
// ticket exists when the call returns). placedAt is taken just before the call.
export async function placeOrder(api: Api, cafe: Cafe, table: string, lines: Line[], note?: string): Promise<PlacedOrder> {
  const tableId = cafe.tables.get(table);
  if (!tableId) throw new Error(`no table ${table}`);
  const payload: Json = lines.map((l) => ({
    item_id: l.item.id,
    quantity: l.quantity,
    note: l.note ?? null,
    // the first option of every required group
    modifier_ids: l.item.groups.filter((g) => g.min > 0).flatMap((g) => (g.modifiers[0] ? [g.modifiers[0].id] : [])),
  }));
  const placedAt = Date.now();
  const { data: orderId, error } = await api.schema("api").rpc("place_waiter_order", {
    p_table_id: tableId,
    p_idempotency_key: crypto.randomUUID(),
    p_lines: payload,
    p_note: note,
  });
  const returnedAt = Date.now();
  if (error) throw new Error(`place_waiter_order: ${error.message}`);
  const { data: ticket } = await api
    .from("kitchen_tickets")
    .select("id, number")
    .eq("order_id", orderId)
    .eq("station_id", cafe.kitchenStationId)
    .eq("kind", "order")
    .single();
  if (!ticket) throw new Error("no kitchen ticket");
  return { orderId, number: ticket.number, ticketId: ticket.id, placedAt, returnedAt };
}

export async function ticketStatus(api: Api, ticketId: string) {
  const { data } = await api.from("kitchen_tickets").select("status, first_seen_at, acknowledged_at").eq("id", ticketId).single();
  return data;
}

export async function moveTicket(api: Api, ticketId: string, expected: "new" | "cooking" | "ready", next: "cooking" | "ready" | "served") {
  const { error } = await api.schema("api").rpc("set_ticket_status", { p_ticket_id: ticketId, p_expected: expected, p_next: next });
  if (error) throw new Error(`set_ticket_status: ${error.message} ${error.details ?? ""}`);
}

// Takes every live kitchen ticket of the given orders off the board.
export async function serveOrders(api: Api, orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  const { data } = await api.from("kitchen_tickets").select("id, kind, status, acknowledged_at").in("order_id", orderIds);
  for (const t of data ?? []) {
    if (t.kind === "void") {
      if (!t.acknowledged_at) await api.schema("api").rpc("acknowledge_void", { p_ticket_id: t.id });
      continue;
    }
    if (t.status === "new" || t.status === "cooking") await moveTicket(api, t.id, t.status, "ready");
    if (t.status !== "served" && t.status !== "cancelled") await moveTicket(api, t.id, "ready", "served");
  }
}

export type Device = { context: BrowserContext; page: Page; memberId: string; label: string };

// A kitchen tablet: the owner makes a pairing code, a fresh browser context
// enters it at /pair (anonymous sign-in plus api.redeem_device_pairing).
export async function pairKitchenDevice(browser: Browser, api: Api, cafe: Cafe, viewport: { width: number; height: number }): Promise<Device> {
  const label = `E2E խոհանոց ${unique()}`;
  const { data: code, error } = await api.schema("api").rpc("create_device_pairing", {
    p_location_id: cafe.locationId,
    p_role: "kitchen",
    p_label: label,
  });
  if (error) throw error;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto("/pair");
  await page.getByLabel("Վեցանիշ կոդը").fill(code);
  await page.getByRole("button", { name: "Միացնել" }).click();
  await expect(page).toHaveURL(new RegExp(`/kitchen/${cafe.kitchenStationId}$`));
  const { data: member } = await api.from("members").select("id").eq("display_name", label).single();
  if (!member) throw new Error("device member not found");
  return { context, page, memberId: member.id, label };
}

export async function revokeDevice(api: Api, memberId: string): Promise<void> {
  await api.schema("api").rpc("revoke_member", { p_member_id: memberId });
}

// Every page of a test reports console errors into the test's list.
export function trackConsole(page: Page, errors: string[]): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
}

// Removes errors a test caused on purpose (a dropped network, a refused
// stale move), so that every other console error still fails the test.
export function allowConsoleErrors(errors: string[], patterns: RegExp[]): void {
  const kept = errors.filter((e) => !patterns.some((p) => p.test(e)));
  errors.splice(0, errors.length, ...kept);
}

export const OFFLINE_NOISE = [/ERR_INTERNET_DISCONNECTED/, /ERR_NETWORK_CHANGED/, /WebSocket connection to .* failed/, /Failed to fetch/];

// Taps «Սկսել հերթափոխը», counting beeps and wake-lock requests on the way.
export async function instrumentShift(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __beeps: number; __wakeLocks: string[] };
    w.__beeps = 0;
    w.__wakeLocks = [];
    const proto = AudioContext.prototype;
    const create = proto.createOscillator;
    proto.createOscillator = function (this: AudioContext) {
      w.__beeps += 1;
      return create.call(this);
    };
    Object.defineProperty(Navigator.prototype, "wakeLock", {
      configurable: true,
      get: () => ({
        request: async (type: string) => {
          w.__wakeLocks.push(type);
          return { released: false, release: async () => {} };
        },
      }),
    });
  });
}

export async function startShift(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Սկսել հերթափոխը" }).click();
  await expect(page.getByRole("button", { name: "Սկսել հերթափոխը" })).toBeHidden();
}

export const slip = (page: Page, ticketId: string) => page.locator(`[data-ticket-id="${ticketId}"]`);
export const column = (page: Page, name: "new" | "cooking" | "ready") => page.getByTestId(`column-${name}`);

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] as number;
}

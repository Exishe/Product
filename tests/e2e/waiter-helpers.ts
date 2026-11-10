import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database";
import type { Json } from "../../src/lib/supabase/types";
import { createCafeWithMenu, newClient, type TestCafe } from "./guest-helpers";
import { unique } from "./helpers";

// Helpers for the waiter app specs. Each worker gets its own café (own owner,
// menu and tables) so parallel runs never meet at a table. Guests act through
// the same api.* functions the guest pages use; the café's owner stands in for
// the kitchen. Never SQL, never a secret key.

type Db = SupabaseClient<Database>;

export const SCREENSHOTS = "/tmp/claude-0/-home-user-Product/707986f3-f7bb-583a-bb93-27d05c735ec3/scratchpad/waiter";

export async function createWaiterCafe(): Promise<TestCafe> {
  const cafe = await createCafeWithMenu({
    categories: [
      { key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } },
      { key: "drinks", names: { hy: "Խմիչքներ", ru: "Напитки", en: "Drinks" } },
    ],
    dishes: [
      { key: "tolma", category: "hot", names: { hy: "Տոլմա", ru: "Толма", en: "Tolma" }, price: 3200 },
      {
        key: "khashlama",
        category: "hot",
        names: { hy: "Տնական խաշլամա գառան մսով, կարտոֆիլով, սմբուկով, լոլիկով և թարմ կանաչիով", ru: "Хашлама" },
        price: 4500,
      },
      { key: "coffee", category: "drinks", names: { hy: "Հայկական սուրճ", ru: "Армянский кофе" }, price: 800 },
      {
        key: "tea",
        category: "drinks",
        names: { hy: "Թեյ", ru: "Чай" },
        price: 600,
        groups: [{ names: { hy: "Տեսակը", ru: "Сорт" }, min: 1, max: 1, options: [{ names: { hy: "Ուրց" } }, { names: { hy: "Կանաչ" }, delta: 100 }] }],
      },
    ],
    tables: ["1", "2", "3", "4", "5", "6", "7", "8"],
  });
  // Orders over 5 000 ֏ wait for the waiter.
  const { error } = await cafe.owner.from("locations").update({ max_auto_accept_total: 5000 }).eq("id", cafe.locationId);
  if (error) throw new Error(`limit: ${error.message}`);
  return cafe;
}

export type WaiterDevice = { storageState: Awaited<ReturnType<BrowserContext["storageState"]>>; memberId: string };

// A waiter tablet: the owner makes a pairing code, a fresh browser context
// enters it at /pair and lands on /waiter.
export async function pairWaiterDevice(browser: Browser, cafe: TestCafe, baseURL: string | undefined): Promise<WaiterDevice> {
  const label = `E2E սրահ ${unique()}`;
  const { data: code, error } = await cafe.owner.schema("api").rpc("create_device_pairing", {
    p_location_id: cafe.locationId,
    p_role: "waiter",
    p_label: label,
  });
  if (error) throw error;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/pair");
  await page.getByLabel("Վեցանիշ կոդը").fill(code);
  await page.getByRole("button", { name: "Միացնել" }).click();
  await expect(page).toHaveURL(/\/waiter$/);
  const storageState = await context.storageState();
  await context.close();
  const { data: member } = await cafe.owner.from("members").select("id").eq("display_name", label).single();
  if (!member) throw new Error("device member not found");
  return { storageState, memberId: member.id };
}

export type Guest = { db: Db; sessionId: string };

export async function seatGuest(cafe: TestCafe, table: string): Promise<Guest> {
  const db = newClient();
  const { error } = await db.auth.signInAnonymously();
  if (error) throw new Error(`anonymous sign-in: ${error.message}`);
  const token = cafe.tables[table]?.token;
  if (!token) throw new Error(`no table ${table}`);
  const { data, error: joinError } = await db.schema("api").rpc("guest_join_table", { p_token: token, p_locale: "hy" });
  if (joinError) throw new Error(`guest_join_table: ${joinError.message}`);
  return { db, sessionId: data };
}

export async function guestOrder(cafe: TestCafe, guest: Guest, lines: { dish: string; quantity: number }[]): Promise<string> {
  const payload: Json = lines.map((l) => ({ item_id: cafe.items[l.dish] as string, quantity: l.quantity }));
  const { data, error } = await guest.db.schema("api").rpc("guest_place_order", {
    p_guest_session_id: guest.sessionId,
    p_idempotency_key: crypto.randomUUID(),
    p_lines: payload,
  });
  if (error) throw new Error(`guest_place_order: ${error.message}`);
  return data;
}

export async function guestRequest(guest: Guest, kind: "call_waiter" | "bring_bill"): Promise<string> {
  const { data, error } = await guest.db.schema("api").rpc("guest_service_request", { p_guest_session_id: guest.sessionId, p_kind: kind });
  if (error) throw new Error(`guest_service_request: ${error.message}`);
  return data;
}

// Whether an api function exists on the dev project yet (PGRST202: not found).
export async function hasFunction(db: Db, name: "resolve_service_request" | "guest_service_request" | "seat_waiting_guests"): Promise<boolean> {
  const zero = "00000000-0000-0000-0000-000000000000";
  const api = db.schema("api");
  const res =
    name === "guest_service_request"
      ? await api.rpc(name, { p_guest_session_id: zero, p_kind: "call_waiter" })
      : name === "seat_waiting_guests"
        ? await api.rpc(name, { p_table_session_id: zero })
        : await api.rpc(name, { p_request_id: zero });
  return res.error?.code !== "PGRST202";
}

export async function tickets(cafe: TestCafe, orderId: string) {
  const { data } = await cafe.owner.from("kitchen_tickets").select("id, status, kind").eq("order_id", orderId).eq("kind", "order");
  return data ?? [];
}

export async function orderStatus(cafe: TestCafe, orderId: string) {
  const { data } = await cafe.owner.from("orders").select("status, kitchen_status, paid_at").eq("id", orderId).single();
  return data;
}

// The kitchen's part: every ticket of the order to "ready".
export async function kitchenReady(cafe: TestCafe, orderId: string): Promise<void> {
  for (const k of await tickets(cafe, orderId)) {
    if (k.status === "new" || k.status === "cooking") {
      const { error } = await cafe.owner.schema("api").rpc("set_ticket_status", { p_ticket_id: k.id, p_expected: k.status, p_next: "ready" });
      if (error) throw new Error(`set_ticket_status: ${error.message}`);
    }
  }
}

export async function kitchenServe(cafe: TestCafe, orderId: string): Promise<void> {
  await kitchenReady(cafe, orderId);
  for (const k of await tickets(cafe, orderId)) {
    if (k.status !== "served") await cafe.owner.schema("api").rpc("set_ticket_status", { p_ticket_id: k.id, p_expected: "ready", p_next: "served" });
  }
}

export const tableButton = (page: Page, label: string) => page.locator(`[data-testid="table"][data-table="${label}"]`);
export const panel = (page: Page) => page.getByTestId("panel");

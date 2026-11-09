import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;

const client = () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const tenantTables = ["menus", "items", "item_translations", "tables", "orders", "order_items", "kitchen_tickets", "bills",
  "members", "device_pairings", "invitations", "subscriptions", "audit_log", "notification_channels"] as const;

describe.skipIf(!ownerEmail || !ownerPassword)("tenant isolation on restaurant-os-dev", () => {
  let demo: string;
  let owner: SupabaseClient<Database>;
  let otherOwner: SupabaseClient<Database>;
  let guest: SupabaseClient<Database>;

  beforeAll(async () => {
    owner = client();
    const signedIn = await owner.auth.signInWithPassword({ email: ownerEmail as string, password: ownerPassword as string });
    expect(signedIn.error).toBeNull();
    const { data } = await owner.from("restaurants").select("id").eq("slug", "demo-cafe").single();
    demo = data!.id;

    otherOwner = client();
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const signedUp = await otherOwner.auth.signUp({ email: `e2e-rls-${id}@pativ.test`, password: "e2e-password-123" });
    expect(signedUp.error).toBeNull();
    const created = await otherOwner.schema("api").rpc("create_restaurant", {
      p_name: `RLS ${id}`, p_slug: `rls-${id}`, p_location_name: "Main", p_display_name: "B",
    });
    expect(created.error).toBeNull();

    guest = client();
    expect((await guest.auth.signInAnonymously()).error).toBeNull();
  });

  it("the demo owner sees the demo café's own rows", async () => {
    const { data } = await owner.from("items").select("id").eq("restaurant_id", demo);
    expect(data?.length).toBe(41);
  });

  for (const table of tenantTables) {
    it(`another café's owner reads nothing of the demo café in ${table}`, async () => {
      const { data, error } = await otherOwner.from(table).select("restaurant_id").eq("restaurant_id", demo);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`a guest reads nothing of the demo café in ${table}`, async () => {
      const { data } = await guest.from(table).select("restaurant_id").eq("restaurant_id", demo);
      expect(data ?? []).toEqual([]);
    });
  }

  it("a guest cannot call staff functions", async () => {
    const { error } = await guest.schema("api").rpc("create_device_pairing", {
      p_location_id: "00000000-0000-0000-0000-000000000000", p_role: "kitchen", p_label: "x",
    });
    expect(error?.message).toBe("forbidden");
  });

  it("nobody signed out can read restaurants or members", async () => {
    const anon = client();
    const r = await anon.from("restaurants").select("id");
    const m = await anon.from("members").select("id");
    expect(r.data ?? []).toEqual([]);
    expect(m.data ?? []).toEqual([]);
  });

  it("the public menu is open to everyone", async () => {
    const { data, error } = await client().schema("api").rpc("public_menu", { p_restaurant_slug: "demo-cafe", p_location_slug: "main" });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});

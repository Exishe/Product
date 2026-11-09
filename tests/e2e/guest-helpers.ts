import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database";
import { ownerEmail, ownerPassword, unique } from "./helpers";

// Guest tests talk to the dev project the same way the app does: with the
// publishable key and a signed-in owner's own session (RLS applies).
type Db = SupabaseClient<Database>;
type Names = Partial<Record<"hy" | "ru" | "en", string>>;

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

export const newClient = (): Db =>
  createClient<Database>(url(), key(), { auth: { persistSession: false, autoRefreshToken: false } });

function must<R extends { data: unknown; error: { message: string } | null }>(r: R, what: string): NonNullable<R["data"]> {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<R["data"]>;
}

let demo: Promise<Db> | undefined;
export function demoOwner(): Promise<Db> {
  demo ??= (async () => {
    const c = newClient();
    const { error } = await c.auth.signInWithPassword({ email: ownerEmail as string, password: ownerPassword as string });
    if (error) throw new Error(`demo owner sign-in: ${error.message}`);
    return c;
  })();
  return demo;
}

// The demo café's sticker for one table, signed for its current qr_version.
export async function demoTable(label: string): Promise<{ id: string; token: string; locationId: string }> {
  const c = await demoOwner();
  const restaurant = must(await c.from("restaurants").select("id").eq("slug", "demo-cafe").single(), "demo café");
  const table = must(
    await c.from("tables").select("id, location_id").eq("restaurant_id", restaurant.id).eq("label", label).single(),
    `demo table ${label}`,
  );
  const token = must(await c.schema("api").rpc("table_qr_token", { p_table_id: table.id }), "table token");
  return { id: table.id, token, locationId: table.location_id };
}

export type TestDish = {
  key: string;
  category: string;
  names: Names;
  description?: Names;
  price: number;
  portion?: { amount: number; unit: "g" | "ml" | "pcs" };
  tags?: string[];
  soldOut?: boolean;
  groups?: { names: Names; min: number; max: number; options: { names: Names; delta?: number; isDefault?: boolean }[] }[];
};

export type TestCafe = {
  owner: Db;
  slug: string;
  name: string;
  restaurantId: string;
  locationId: string;
  items: Record<string, string>;
  tables: Record<string, { id: string; token: string }>;
};

// A brand-new café with its own owner, menu, tables and a published menu, so
// guest tests never change the demo café's menu.
export async function createCafeWithMenu(opts: {
  categories: { key: string; names: Names }[];
  dishes: TestDish[];
  tables?: string[];
  name?: string;
}): Promise<TestCafe> {
  const id = unique();
  const owner = newClient();
  const signedUp = await owner.auth.signUp({ email: `e2e-guest-${id}@pativ.test`, password: "e2e-password-123" });
  if (signedUp.error) throw new Error(`sign-up: ${signedUp.error.message}`);
  const name = opts.name ?? `Թեստ ${id}`;
  const slug = `e2e-${id}`;
  const restaurantId = must(
    await owner.schema("api").rpc("create_restaurant", {
      p_name: name,
      p_slug: slug,
      p_location_name: "Main",
      p_display_name: "Թեստ",
    }),
    "create_restaurant",
  );
  const locationId = must(await owner.from("locations").select("id").eq("restaurant_id", restaurantId).single(), "location").id;
  const r = { restaurant_id: restaurantId };
  const tr = (names: Names) => Object.entries(names).map(([locale, name]) => ({ ...r, locale: locale as "hy" | "ru" | "en", name }));

  const menuId = must(await owner.from("menus").insert({ ...r, internal_name: "Main" }).select("id").single(), "menu").id;
  must(await owner.from("menu_locations").insert({ ...r, menu_id: menuId, location_id: locationId }).select(), "menu location");
  must(await owner.from("menu_translations").insert(tr({ hy: "Ճաշացանկ", ru: "Меню", en: "Menu" }).map((x) => ({ ...x, menu_id: menuId }))).select(), "menu names");

  const categories: Record<string, string> = {};
  for (const [sort, c] of opts.categories.entries()) {
    const cid = must(await owner.from("categories").insert({ ...r, menu_id: menuId, sort }).select("id").single(), "category").id;
    must(await owner.from("category_translations").insert(tr(c.names).map((x) => ({ ...x, category_id: cid }))).select(), "category names");
    categories[c.key] = cid;
  }

  const items: Record<string, string> = {};
  for (const [sort, d] of opts.dishes.entries()) {
    const iid = must(
      await owner
        .from("items")
        .insert({
          ...r,
          category_id: categories[d.category] as string,
          price: d.price,
          sort,
          tags: d.tags ?? [],
          portion_amount: d.portion?.amount ?? null,
          portion_unit: d.portion?.unit ?? null,
        })
        .select("id")
        .single(),
      "item",
    ).id;
    must(
      await owner
        .from("item_translations")
        .insert(tr(d.names).map((x) => ({ ...x, item_id: iid, description: d.description?.[x.locale] ?? null })))
        .select(),
      "item names",
    );
    for (const [gsort, g] of (d.groups ?? []).entries()) {
      const gid = must(
        await owner.from("modifier_groups").insert({ ...r, min_select: g.min, max_select: g.max, sort: gsort }).select("id").single(),
        "group",
      ).id;
      must(await owner.from("modifier_group_translations").insert(tr(g.names).map((x) => ({ ...x, group_id: gid }))).select(), "group names");
      for (const [osort, o] of g.options.entries()) {
        const oid = must(
          await owner
            .from("modifiers")
            .insert({ ...r, group_id: gid, price_delta: o.delta ?? 0, is_default: o.isDefault ?? false, sort: osort })
            .select("id")
            .single(),
          "option",
        ).id;
        must(await owner.from("modifier_translations").insert(tr(o.names).map((x) => ({ ...x, modifier_id: oid }))).select(), "option names");
      }
      must(await owner.from("item_modifier_groups").insert({ ...r, item_id: iid, group_id: gid, sort: gsort }).select(), "item group");
    }
    if (d.soldOut) must(await owner.from("stop_list").insert({ ...r, location_id: locationId, item_id: iid }).select(), "stop list");
    items[d.key] = iid;
  }

  const tables: TestCafe["tables"] = {};
  for (const [sort, label] of (opts.tables ?? ["1", "2"]).entries()) {
    const tid = must(await owner.from("tables").insert({ ...r, location_id: locationId, label, sort }).select("id").single(), "table").id;
    tables[label] = { id: tid, token: must(await owner.schema("api").rpc("table_qr_token", { p_table_id: tid }), "token") };
  }

  must(await owner.schema("api").rpc("publish_menu", { p_location_id: locationId }), "publish");
  return { owner, slug, name, restaurantId, locationId, items, tables };
}

// Base64url helpers for building tampered and forged tokens in tests.
export const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const b64urlEncode = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// The same signature with another table's id inside: a forged sticker.
export function forgeToken(token: string, otherTableId: string): string {
  const raw = b64urlDecode(token);
  Buffer.from(otherTableId.replace(/-/g, ""), "hex").copy(raw, 2);
  return b64urlEncode(raw);
}

// One flipped character in the signature part.
export function tamperToken(token: string): string {
  const i = 40;
  return token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
}

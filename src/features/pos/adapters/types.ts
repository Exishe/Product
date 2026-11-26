import type { PosPayload } from "../payload";

export const POS_VENDORS = ["test", "webhook", "iiko", "syrve", "poster"] as const;
export type PosVendor = (typeof POS_VENDORS)[number];

/** Non-secret choices stored on the connection (public.pos_connections.settings). */
export type PosSettings = {
  url?: string;
  organization_id?: string;
  organization_name?: string;
  terminal_group_id?: string;
  terminal_group_name?: string;
  base_url?: string;
  spot_id?: string;
  spot_name?: string;
  phone?: string;
};

/** Everything one send needs (from api.pos_claim). */
export type SendJob = {
  id: number;
  vendor: PosVendor;
  settings: PosSettings;
  secret: string | null;
  payload: PosPayload;
  isTest: boolean;
  /** iiko/Syrve: the POS order this table session already has. */
  sessionOrderId: string | null;
};

/** retry false: retrying the same thing cannot help (unmapped dishes, a refused key, a bad request). */
export type SendResult = { ok: true; externalId: string | null } | { ok: false; error: string; retry: boolean };

/** fetch with a deadline; injected so tests never reach the network. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type HttpReply = { status: number; json: unknown; text: string };

/** A product of the POS menu, with the options that can go with it. */
export type PosProduct = {
  id: string;
  name: string;
  modifiers: { id: string; groupId: string | null; name: string }[];
};

export type PosTable = { id: string; name: string; number: number | null; section: string | null };

export type PosCatalog = { products: PosProduct[]; tables: PosTable[] };

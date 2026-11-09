import { z } from "zod";

// Shapes of api.platform_cafes and api.platform_problems.
const cafe = z.object({
  restaurant_id: z.string(),
  restaurant_name: z.string(),
  slug: z.string(),
  restaurant_status: z.string(),
  location_id: z.string(),
  location_name: z.string(),
  plan: z.string().nullable(),
  status: z.enum(["trialing", "active", "past_due", "canceled"]).nullable(),
  price_amd: z.number().nullable(),
  trial_ends_at: z.string().nullable(),
  current_period_end: z.string().nullable(),
  last_order_at: z.string().nullable(),
  devices_online: z.number(),
  orders_per_open_day: z.number().nullable(),
  qr_share_pct: z.number().nullable(),
});

const problems = z.object({
  dead_letters: z.array(
    z.object({
      id: z.number(),
      restaurant_name: z.string(),
      event: z.string(),
      attempts: z.number(),
      last_error: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  failed_imports: z.array(
    z.object({
      id: z.string(),
      restaurant_name: z.string(),
      error: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  offline_devices: z.array(
    z.object({
      id: z.string(),
      restaurant_name: z.string(),
      display_name: z.string(),
      role: z.string(),
      last_seen_at: z.string().nullable(),
    }),
  ),
});

export type PlatformCafe = z.infer<typeof cafe>;
export type PlatformProblems = z.infer<typeof problems>;

export const parseCafes = (json: unknown): PlatformCafe[] => z.array(cafe).parse(json);
export const parseProblems = (json: unknown): PlatformProblems => problems.parse(json);

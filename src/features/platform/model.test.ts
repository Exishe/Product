import { describe, expect, it } from "vitest";
import { parseCafes, parseProblems } from "./model";

describe("platform answers", () => {
  it("reads the café list", () => {
    const [c] = parseCafes([
      {
        restaurant_id: "r",
        restaurant_name: "Դեմո սրճարան",
        slug: "demo-cafe",
        restaurant_status: "active",
        created_at: "2026-11-09T10:00:00Z",
        location_id: "l",
        location_name: "Main",
        plan: "service",
        status: "trialing",
        price_amd: 0,
        trial_ends_at: "2026-12-09T10:00:00Z",
        current_period_end: null,
        last_order_at: null,
        devices_online: 2,
        orders_per_open_day: 3.5,
        qr_share_pct: 67,
      },
    ]);
    expect(c?.status).toBe("trialing");
  });

  it("reads delivery problems", () => {
    const p = parseProblems({
      dead_letters: [
        {
          id: 1,
          restaurant_name: "M",
          event: "order.overdue",
          attempts: 8,
          last_error: null,
          created_at: "x",
        },
      ],
      failed_imports: [],
      offline_devices: [],
    });
    expect(p.dead_letters[0]?.attempts).toBe(8);
  });

  it("refuses an unknown status", () => {
    expect(() => parseCafes([{ status: "gold" }])).toThrow();
  });
});

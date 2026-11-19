import { describe, expect, it } from "vitest";
import { summarizeShift, type ShiftBill, type ShiftOrder } from "./shift-model";

const ME = "me";
const pay = (method: string, amount: number, over: Partial<ShiftBill["payments"][number]> = {}) => ({
  method,
  amount,
  status: "succeeded",
  recorded_by: ME,
  ...over,
});
const bill = (payments: ShiftBill["payments"], over: Partial<ShiftBill> = {}): ShiftBill => ({
  status: "paid",
  total: payments.reduce((s, p) => s + p.amount, 0),
  closed_by: ME,
  payments,
  ...over,
});
const order = (over: Partial<ShiftOrder>): ShiftOrder => ({
  source: "qr",
  status: "accepted",
  placed_at: "2026-11-19T18:00:00Z",
  accepted_at: null,
  accepted_by: null,
  created_by_member: null,
  ...over,
});

describe("my shift", () => {
  it("adds up the cash and card of the bills this person closed", () => {
    const s = summarizeShift(
      [
        bill([pay("cash", 12000)]),
        bill([pay("cash", 3000), pay("card_terminal", 5000)]),
        bill([pay("cash", 9999)], { closed_by: "colleague" }),
        bill([pay("cash", 7000)], { status: "void" }),
        bill([pay("card_terminal", 4000, { status: "failed" })]),
      ],
      [],
      ME,
    );
    expect(s).toMatchObject({ tables: 3, cash: 15000, card: 5000 });
  });

  it("counts the orders entered and the guest orders accepted, with the mean wait", () => {
    const s = summarizeShift(
      [],
      [
        order({
          source: "waiter",
          created_by_member: ME,
          accepted_by: ME,
          accepted_at: "2026-11-19T18:00:00Z",
        }),
        order({ source: "waiter", created_by_member: ME, status: "rejected" }),
        order({ accepted_by: ME, accepted_at: "2026-11-19T18:02:00Z" }),
        order({ accepted_by: ME, accepted_at: "2026-11-19T18:04:00Z" }),
        order({ accepted_by: "colleague", accepted_at: "2026-11-19T18:30:00Z" }),
      ],
      ME,
    );
    expect(s).toEqual({ tables: 0, cash: 0, card: 0, entered: 1, accepted: 2, acceptMinutes: 3 });
  });

  it("has no average when nothing was accepted", () => {
    expect(summarizeShift([], [], ME).acceptMinutes).toBeNull();
  });
});

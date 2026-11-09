import type { Locale } from "@/i18n/routing";

export type MemberRole = "owner" | "manager" | "waiter" | "kitchen" | "cashier";

export type Membership = {
  id: string;
  restaurantId: string;
  role: MemberRole;
  kind: "person" | "device";
  displayName: string;
  locale: Locale;
};

// A person can work at several cafés. Use the one they last chose if their
// role there is allowed on this screen, otherwise the first one that is.
export function pickMembership(
  memberships: readonly Membership[],
  roles: readonly MemberRole[],
  preferredRestaurantId: string | null,
): Membership | null {
  const allowed = memberships.filter((m) => roles.includes(m.role));
  return allowed.find((m) => m.restaurantId === preferredRestaurantId) ?? allowed[0] ?? null;
}

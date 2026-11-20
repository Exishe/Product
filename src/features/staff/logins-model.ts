// The rows api.list_staff_logins returns (a JSON array), checked before use.
export type StaffLoginData = {
  memberId: string;
  username: string;
  role: "waiter" | "kitchen";
  stationName: string | null;
  isActive: boolean;
  passwordSet: boolean;
  lastSignInAt: string | null;
};

export function parseStaffLogins(value: unknown): StaffLoginData[] {
  if (!Array.isArray(value)) return [];
  const rows: StaffLoginData[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.member_id !== "string" || typeof r.username !== "string") continue;
    if (r.role !== "waiter" && r.role !== "kitchen") continue;
    rows.push({
      memberId: r.member_id,
      username: r.username,
      role: r.role,
      stationName: typeof r.station_name === "string" ? r.station_name : null,
      isActive: r.is_active !== false,
      passwordSet: r.password_set === true,
      lastSignInAt: typeof r.last_sign_in_at === "string" ? r.last_sign_in_at : null,
    });
  }
  return rows;
}

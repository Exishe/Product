// Where to go after signing in: only our own invite, admin, waiter and kitchen paths,
// never another site (no open redirects).
export function safeNext(value: unknown, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  return /^\/(invite\/[A-Za-z0-9_-]{8,64}|admin(\/[a-z0-9-]+)*|waiter|kitchen\/[0-9a-f-]{36})$/.test(next)
    ? next
    : fallback;
}

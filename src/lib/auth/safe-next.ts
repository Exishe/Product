// Where to go after signing in: only our own invite, admin and waiter paths,
// never another site (no open redirects).
export function safeNext(value: unknown, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  return /^\/(invite\/[A-Za-z0-9_-]{8,64}|admin(\/[a-z0-9-]+)*|waiter)$/.test(next) ? next : fallback;
}

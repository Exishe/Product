// The server's clock for staff screens (R20): ticket timers use it instead of
// the tablet's own clock. Touches nothing else, so it's cheap and always up.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}

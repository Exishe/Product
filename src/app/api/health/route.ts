// Uptime checks hit this every minute (support.md). It touches nothing else,
// so it stays up even if the database is down.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

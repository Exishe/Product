// Browsers still ask for /favicon.ico when a page has no icon link at the
// moment it finishes loading, which happens during client-side navigation
// between guest pages. Point them at the app icon instead of a 404 (which
// also showed up as a console error).
export const dynamic = "force-static";

export function GET() {
  return new Response(null, {
    status: 308,
    headers: { Location: "/icons/icon-192.png", "Cache-Control": "public, max-age=86400" },
  });
}

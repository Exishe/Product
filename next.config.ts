import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Content Security Policy (security-review.md, M-2). Every script, style, font
// and service worker is our own; the browser talks only to us and to the
// Supabase project (REST, Realtime over wss, Storage images). The guest menu is
// rendered statically, so the policy is static too: Next.js's inline bootstrap
// scripts need 'unsafe-inline' until a nonce-based policy is worth making every
// page dynamic (accepted risk A-3). Development adds 'unsafe-eval' for React's
// dev tooling and the HMR socket.
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV === "development";
  let supabase = "https://*.supabase.co";
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    // keep the wildcard
  }
  const realtime = supabase.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${realtime}${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // forbidden() renders app/forbidden.tsx with status 403.
  experimental: { authInterrupts: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);

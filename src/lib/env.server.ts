import "server-only";
import { z } from "zod";
import { clean, type Source } from "./env";

// Server configuration, kept out of client bundles (security-review.md, L-3).
// The app holds no Supabase secret key (ADR-038), so the only server secrets
// are the AI provider key and the VAPID private key.

const serverSchema = z.object({
  APP_BASE_URL: z.url(),
  // "fake" returns a fixed menu, for browser tests of the import flow.
  AI_PROVIDER: z.enum(["gemini", "claude", "fake"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // Tried in order: the free tier allows 20 requests a day per model.
  GEMINI_MODELS: z
    .string()
    .default("gemini-flash-latest,gemini-3-flash-preview,gemini-3.1-flash-lite")
    .transform((list) =>
      list
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1)),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Telegram alerts (ADR-035). The bot token is in Supabase Vault, not here;
  // the username only builds the t.me link.
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^@?[A-Za-z][A-Za-z0-9_]{3,31}$/)
    .transform((s) => s.replace(/^@/, ""))
    .optional(),
  // Web push (ADR-035). Generated at deploy time by scripts/gen-vapid.ts,
  // straight into Vercel; the private key is never printed or committed.
  VAPID_PUBLIC_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{86,87}$/)
    .optional(),
  VAPID_PRIVATE_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{42,43}$/)
    .optional(),
  // RFC 8292 contact: a mailto: or https: URL. Defaults to APP_BASE_URL.
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)\S+$/)
    .optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: Source): ServerEnv {
  return serverSchema.parse(clean(source));
}

// The VAPID public key for pages that must not fail on other missing settings
// (the guest status page, ADR-049). null when it is missing or malformed.
export function vapidPublicKeyOrNull(source: Source): string | null {
  const parsed = serverSchema.shape.VAPID_PUBLIC_KEY.safeParse(clean(source).VAPID_PUBLIC_KEY);
  return parsed.success ? (parsed.data ?? null) : null;
}

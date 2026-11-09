import { z } from "zod";

// Validated configuration. The app holds no Supabase secret key (ADR-038), so
// the only server secret is the AI provider key.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

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

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

type Source = Record<string, string | undefined>;

// Empty strings from .env files count as missing.
function clean(source: Source): Source {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
}

export function parsePublicEnv(source: Source): PublicEnv {
  return publicSchema.parse(clean(source));
}

export function parseServerEnv(source: Source): ServerEnv {
  return serverSchema.parse(clean(source));
}

// Next.js inlines NEXT_PUBLIC_* only when they are written out in full.
export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

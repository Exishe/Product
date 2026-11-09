import { z } from "zod";

// Validated configuration. The app holds no Supabase secret key (ADR-038), so
// the only server secret is the AI provider key.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const serverSchema = z.object({
  APP_BASE_URL: z.url(),
  AI_PROVIDER: z.enum(["gemini", "claude"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
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

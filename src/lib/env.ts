import { z } from "zod";

// Validated public configuration, safe for the browser. The server settings
// are in env.server.ts, which client code cannot import.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export type Source = Record<string, string | undefined>;

// Empty strings from .env files count as missing.
export function clean(source: Source): Source {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
}

export function parsePublicEnv(source: Source): PublicEnv {
  return publicSchema.parse(clean(source));
}

// Next.js inlines NEXT_PUBLIC_* only when they are written out in full.
export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

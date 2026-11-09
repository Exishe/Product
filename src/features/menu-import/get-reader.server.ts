import "server-only";
import { parseServerEnv } from "@/lib/env";
import { claudeReader } from "./claude.server.ts";
import { fakeReader } from "./fake.ts";
import { geminiReader } from "./gemini.server.ts";
import { ReadError, type MenuReader } from "./reader.ts";

// AI_PROVIDER picks the adapter; gemini while the free-only rule holds.
export function getReader(): MenuReader {
  const env = parseServerEnv(process.env);
  switch (env.AI_PROVIDER) {
    case "gemini":
      if (!env.GEMINI_API_KEY) throw new ReadError("provider_unavailable", "GEMINI_API_KEY is not set");
      return geminiReader(env.GEMINI_API_KEY, env.GEMINI_MODELS);
    case "claude":
      if (!env.ANTHROPIC_API_KEY) throw new ReadError("provider_unavailable", "ANTHROPIC_API_KEY is not set");
      return claudeReader(env.ANTHROPIC_API_KEY);
    case "fake":
      return fakeReader();
  }
}

import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";
import { parseServerEnv } from "./env.server";

const goodPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "https://mhuxfmdehkgpjunxgptc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuv",
};

describe("parsePublicEnv", () => {
  it("rejects a missing Supabase URL", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: goodPublic.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }),
    ).toThrow();
  });

  it("rejects a URL that is not a URL", () => {
    expect(() => parsePublicEnv({ ...goodPublic, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow();
  });

  it("accepts a complete public config", () => {
    expect(parsePublicEnv(goodPublic)).toEqual(goodPublic);
  });
});

describe("parseServerEnv", () => {
  it("defaults the AI provider to gemini (free-only rule)", () => {
    expect(parseServerEnv({ APP_BASE_URL: "http://localhost:3000" }).AI_PROVIDER).toBe("gemini");
  });

  it("rejects an unknown AI provider", () => {
    expect(() => parseServerEnv({ APP_BASE_URL: "http://localhost:3000", AI_PROVIDER: "openai" })).toThrow();
  });

  it("has no field for a Supabase secret key (ADR-038)", () => {
    const parsed = parseServerEnv({
      APP_BASE_URL: "http://localhost:3000",
      SUPABASE_SECRET_KEY: "sb_secret_x",
    });
    expect(parsed).not.toHaveProperty("SUPABASE_SECRET_KEY");
  });

  it("takes the bot username with or without @ and rejects a malformed VAPID key", () => {
    const base = { APP_BASE_URL: "http://localhost:3000" };
    expect(parseServerEnv({ ...base, TELEGRAM_BOT_USERNAME: "@PativBot" }).TELEGRAM_BOT_USERNAME).toBe("PativBot");
    expect(parseServerEnv(base).VAPID_PRIVATE_KEY).toBeUndefined();
    expect(() => parseServerEnv({ ...base, VAPID_PRIVATE_KEY: "not a key" })).toThrow();
    expect(() => parseServerEnv({ ...base, VAPID_SUBJECT: "http://insecure.example" })).toThrow();
  });

  it("reads the Gemini model list in order", () => {
    const env = parseServerEnv({ APP_BASE_URL: "http://localhost:3000", GEMINI_MODELS: "a, b ,c" });
    expect(env.GEMINI_MODELS).toEqual(["a", "b", "c"]);
    expect(parseServerEnv({ APP_BASE_URL: "http://localhost:3000" }).GEMINI_MODELS[0]).toBe(
      "gemini-flash-latest",
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { handleTelegram, MAX_UPDATE_BYTES } from "./telegram-handler";

const update = JSON.stringify({
  update_id: 1,
  message: { chat: { id: 4242 }, text: "/start abcdefghijklmnop" },
});

describe("handleTelegram", () => {
  it.each([null, "", "has spaces", "x".repeat(257)])(
    "refuses a missing or malformed secret header (%j) without calling the database",
    async (secret) => {
      const rpc = vi.fn();
      expect((await handleTelegram(secret, update, rpc)).status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("refuses bodies that are not updates", async () => {
    const rpc = vi.fn();
    expect((await handleTelegram("s3cret", "not json", rpc)).status).toBe(400);
    expect((await handleTelegram("s3cret", "[1]", rpc)).status).toBe(400);
    expect((await handleTelegram("s3cret", '{"message":{}}', rpc)).status).toBe(400);
    expect((await handleTelegram("s3cret", "x".repeat(MAX_UPDATE_BYTES + 1), rpc)).status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the secret and the update to the database", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    expect(await handleTelegram("s3cret", update, rpc)).toEqual({ status: 200, body: {} });
    expect(rpc).toHaveBeenCalledWith("s3cret", JSON.parse(update));
  });

  it("answers 401 when the database refuses the secret", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "forbidden" } }));
    expect((await handleTelegram("wrong", update, rpc)).status).toBe(401);
  });

  it("returns the bot's reply as the webhook answer", async () => {
    const reply = { method: "sendMessage", chat_id: 4242, text: "Պատրաստ է։" };
    const rpc = vi.fn(async () => ({ data: { reply }, error: null }));
    expect(await handleTelegram("s3cret", update, rpc)).toEqual({ status: 200, body: reply });
  });

  it("answers 500 on other errors so Telegram retries", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    expect((await handleTelegram("s3cret", update, rpc)).status).toBe(500);
  });
});

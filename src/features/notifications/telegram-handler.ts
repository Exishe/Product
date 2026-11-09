import "server-only";

// /api/telegram: Telegram's webhook. The secret header and the update go to
// api.telegram_update, which checks the secret against Vault (ADR-038). When
// the database wants the bot to answer, the answer is returned as the webhook's
// response body (a Bot API method call), so the app never needs the bot token.

const SECRET = /^[A-Za-z0-9_-]{1,256}$/;
export const MAX_UPDATE_BYTES = 64 * 1024;

type RpcResult = { data: unknown; error: { message: string } | null };

export type TelegramOutcome = { status: number; body: Record<string, unknown> };

export async function handleTelegram(
  secret: string | null,
  rawBody: string,
  update: (secret: string, body: Record<string, unknown>) => PromiseLike<RpcResult>,
): Promise<TelegramOutcome> {
  if (!secret || !SECRET.test(secret)) return { status: 401, body: { error: "unauthorized" } };
  if (rawBody.length > MAX_UPDATE_BYTES) return { status: 413, body: { error: "too_large" } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "bad_json" } };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof (parsed as { update_id?: unknown }).update_id !== "number"
  ) {
    return { status: 400, body: { error: "not_an_update" } };
  }
  const { data, error } = await update(secret, parsed as Record<string, unknown>);
  if (error) {
    // Telegram retries anything but 2xx; a wrong secret should not be retried forever,
    // but it also must not look like success.
    return error.message === "forbidden"
      ? { status: 401, body: { error: "unauthorized" } }
      : { status: 500, body: { error: "failed" } };
  }
  const reply = (data as { reply?: Record<string, unknown> } | null)?.reply;
  return { status: 200, body: reply ?? {} };
}

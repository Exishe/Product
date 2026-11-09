import { handleTelegram } from "@/features/notifications/telegram-handler";
import { createPublicClient } from "@/lib/supabase/public";
import type { Json } from "@/lib/supabase/types";

// Telegram's webhook (ADR-038): no session and no secret key here. The
// database checks X-Telegram-Bot-Api-Secret-Token against Vault.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const outcome = await handleTelegram(
    request.headers.get("x-telegram-bot-api-secret-token"),
    await request.text(),
    (secret, update) =>
      createPublicClient()
        .schema("api")
        .rpc("telegram_update", { p_secret: secret, p_update: update as Json }),
  );
  return Response.json(outcome.body, { status: outcome.status, headers: { "Cache-Control": "no-store" } });
}

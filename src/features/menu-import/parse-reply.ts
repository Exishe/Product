import { ReadError } from "./reader.ts";
import { aiMenu, type AiMenu } from "./schema.ts";

// A provider's JSON reply, checked against the same schema whichever provider
// wrote it. An empty list of sections means the photo wasn't a menu.
export function parseReply(text: string): AiMenu {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ReadError("unreadable", "reply is not JSON");
  }
  const categories = (json as { categories?: unknown } | null)?.categories;
  if (Array.isArray(categories) && categories.length === 0) throw new ReadError("not_a_menu");
  const menu = aiMenu.safeParse(json);
  if (!menu.success) throw new ReadError("unreadable", menu.error.issues[0]?.message);
  return menu.data;
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { parseReply } from "./parse-reply.ts";
import { READ_MENU_PROMPT } from "./prompt.ts";
import { ReadError, type ImageInput, type MenuReader, type ReadResult } from "./reader.ts";
import { aiMenuJsonSchema } from "./schema.ts";

// Claude, switched off while the free-only rule holds (AI_PROVIDER=gemini).
// Same prompt and schema as Gemini, so a switch can be measured on the same
// menu photos. A cheaper model is the owner's call (docs/02-stack/stack.md).

const MODEL = "claude-opus-5-5";

export function claudeReader(apiKey: string): MenuReader {
  const client = new Anthropic({ apiKey, timeout: 120_000 });
  return {
    async read(images: ImageInput[]): Promise<ReadResult> {
      try {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          // On a policy decline the API re-runs the request on a fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { format: { type: "json_schema", schema: aiMenuJsonSchema() } },
          messages: [
            {
              role: "user",
              content: [
                ...images.map((image) => ({
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: image.mimeType, data: image.data },
                })),
                { type: "text" as const, text: READ_MENU_PROMPT },
              ],
            },
          ],
        });
        if (response.stop_reason === "refusal") throw new ReadError("unreadable", "refusal");
        if (response.stop_reason === "max_tokens") throw new ReadError("unreadable", "reply cut off");
        const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
        return {
          menu: parseReply(text),
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error) {
        if (error instanceof ReadError) throw error;
        if (error instanceof Anthropic.RateLimitError) throw new ReadError("rate_limited");
        throw new ReadError("provider_unavailable", error instanceof Error ? error.message : undefined);
      }
    },
  };
}

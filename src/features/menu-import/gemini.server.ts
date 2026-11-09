import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { parseReply } from "./parse-reply.ts";
import { READ_MENU_PROMPT } from "./prompt.ts";
import { ReadError, type ImageInput, type MenuReader, type ReadResult } from "./reader.ts";
import { aiMenuJsonSchema } from "./schema.ts";

// Gemini on the free tier (ADR-035): 20 requests a day per model, and one
// import is one request, so the reader moves to the next model in the list
// when one is used up or gone. Structured output keeps the reply to our JSON
// schema; parseReply checks it again with Zod.

const TIMEOUT_MS = 90_000;
const RETRY_DELAYS_MS = [2_000, 6_000];
const RETRYABLE = new Set([500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function geminiReader(apiKey: string, models: readonly string[]): MenuReader {
  // v1beta: structured output with responseJsonSchema and the newest models live there.
  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });

  async function generate(model: string, images: ImageInput[]) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: READ_MENU_PROMPT },
                ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })),
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: aiMenuJsonSchema(),
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          },
        });
      } catch (error) {
        // Google's side is often briefly overloaded; try twice more.
        const delay = RETRY_DELAYS_MS[attempt];
        if (error instanceof ApiError && RETRYABLE.has(error.status) && delay !== undefined) {
          await sleep(delay);
          continue;
        }
        throw error;
      }
    }
  }

  return {
    async read(images: ImageInput[]): Promise<ReadResult> {
      let lastError: ReadError = new ReadError("provider_unavailable", "no model configured");
      for (const model of models) {
        try {
          return await readWith(model, images);
        } catch (error) {
          if (!(error instanceof ReadError)) throw error;
          lastError = error;
          // A used-up or retired model: try the next one. Anything else is final.
          if (error.code !== "rate_limited" && !error.message.includes("NOT_FOUND")) throw error;
        }
      }
      throw lastError;
    },
  };

  async function readWith(model: string, images: ImageInput[]): Promise<ReadResult> {
    try {
      const response = await generate(model, images);
      const text = response.text;
      if (!text) throw new ReadError("unreadable", response.candidates?.[0]?.finishReason ?? "empty reply");
      return {
        menu: parseReply(text),
        model: response.modelVersion ?? model,
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      };
    } catch (error) {
      if (error instanceof ReadError) throw error;
      if (error instanceof ApiError && error.status === 429) throw new ReadError("rate_limited");
      throw new ReadError("provider_unavailable", error instanceof Error ? error.message : undefined);
    }
  }
}

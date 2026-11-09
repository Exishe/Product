import type { AiMenu } from "./schema.ts";

// A menu photo reader. Adapters call one provider each and return data that
// has already passed the `aiMenu` schema (ADR-035).

export type ImageInput = { mimeType: "image/jpeg" | "image/png" | "image/webp"; data: string /* base64 */ };

export type ReadResult = {
  menu: AiMenu;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface MenuReader {
  read(images: ImageInput[]): Promise<ReadResult>;
}

// The reasons a reading can fail, as the review screen explains them.
export type ReadErrorCode = "provider_unavailable" | "rate_limited" | "unreadable" | "not_a_menu";

export class ReadError extends Error {
  constructor(
    readonly code: ReadErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ReadError";
  }
}

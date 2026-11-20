import { randomInt } from "node:crypto";

// No 0 / O, 1 / l / I: a password read from a screen or a sticker is typed
// without guessing. 54 characters, 10 of them: about 57 bits.
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const PASSWORD_LENGTH = 10;

// From the operating system's CSPRNG; randomInt has no modulo bias.
export function generatePassword(length = PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

// A table QR token is 34 bytes in base64url without padding: 46 characters
// (ADR-006, multi-tenancy-and-security.md). Anything else is refused before it
// costs a database call; the signature itself is checked in Postgres.
const TOKEN = /^[A-Za-z0-9_-]{46}$/;

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

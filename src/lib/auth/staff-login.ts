// Staff logins (ADR-067): a waiter or kitchen screen signs in with a short
// username instead of an e-mail address. Supabase Auth wants an e-mail, so a
// username is mapped to <username>@staff.pativ.invalid. The domain ends in
// .invalid (reserved, never deliverable) and is not the @pativ.test domain that
// the nightly purge of test cafés deletes. Keep it in step with
// private.staff_email_domain() in the database.
export const STAFF_EMAIL_DOMAIN = "staff.pativ.invalid";

// Same rule as the staff_logins.username check: 3–64 characters, lowercase
// letters, digits and hyphens, not starting or ending with a hyphen.
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
// The part the owner may choose after "<café>-": 1–15 characters.
export const SUFFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,13}[a-z0-9])?$/;

export const PASSWORD_MIN = 8;
// bcrypt reads at most 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

export function staffEmail(username: string): string {
  return `${username}@${STAFF_EMAIL_DOMAIN}`;
}

export function isStaffEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`);
}

export type LoginIdentity = { kind: "email" | "username"; email: string };

// What the sign-in form took: anything with an "@" is an e-mail address (a
// staff address typed in full works too), anything else is a username.
// Returns null for an empty value or a username that can't exist.
export function loginIdentity(input: string): LoginIdentity | null {
  const value = input.trim();
  if (value === "") return null;
  if (value.includes("@")) return { kind: "email", email: value };
  const username = value.toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return null;
  return { kind: "username", email: staffEmail(username) };
}

export function passwordProblem(password: string): "short" | "long" | null {
  if (Array.from(password).length < PASSWORD_MIN) return "short";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "long";
  return null;
}

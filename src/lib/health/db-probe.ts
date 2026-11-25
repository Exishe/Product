// Reads the answer of one cheap API call as "the database API is up" or not.
// A refused token is an answer from Postgres, so the API works. A PostgREST
// error (PGRST*, for example PGRST002 when its schema cache could not be built),
// a missing answer or a 5xx status means guests cannot open the menu.
export type ProbeAnswer = { error: { code?: string; message?: string } | null; status: number };

export function apiIsUp(answer: ProbeAnswer): boolean {
  if (answer.status === 0 || answer.status >= 500) return false;
  const code = answer.error?.code ?? "";
  return !code.startsWith("PGRST");
}

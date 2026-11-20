import { appendFileSync } from "node:fs";
import type { Browser, BrowserContext } from "@playwright/test";

// Supabase Auth limits anonymous sign-ins per IP address per hour (30 by
// default). When E2E_ANON_LOG names a file, every anonymous sign-in a run makes
// is appended to it as one line, so a run's total is `wc -l`. Off otherwise.
const log = process.env.E2E_ANON_LOG;

export const noteAnonSignIn = (who: string): void => {
  if (log) appendFileSync(log, `${who}\n`);
};

// Browser side: an anonymous sign-in is a POST to /auth/v1/signup without an email.
function watchAnonSignIns(context: BrowserContext, who: string): void {
  context.on("request", (r) => {
    if (r.method() !== "POST" || !r.url().includes("/auth/v1/signup")) return;
    try {
      if (!(r.postDataJSON() as { email?: string } | null)?.email) noteAnonSignIn(`${who} browser`);
    } catch {
      noteAnonSignIn(`${who} browser`);
    }
  });
}

// Wraps browser.newContext so every context a test opens is watched.
export function watchBrowser(browser: Browser, who: string): () => void {
  if (!log) return () => {};
  const original = browser.newContext.bind(browser);
  browser.newContext = (async (...args: Parameters<Browser["newContext"]>) => {
    const context = await original(...args);
    watchAnonSignIns(context, who);
    return context;
  }) as Browser["newContext"];
  return () => {
    browser.newContext = original;
  };
}

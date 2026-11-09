import type { Locale } from "@/i18n/routing";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The "ask your waiter" page for a refused sticker. It is served by the QR
// route with HTTP 404, so it is a small self-contained document: it shows at
// once on a weak connection and needs no JavaScript. Colours are the design
// tokens (design/tokens.css); the fonts fall back to the phone's own.
export function tableErrorHtml(locale: Locale, text: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#1d6a43">
<title>${escape(text.title)}</title>
<style>
  html { color-scheme: light; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: #fbfcf8; color: #13241b;
    font: 1rem/1.5 "Google Sans", "Noto Sans Armenian", "Noto Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { box-sizing: border-box; width: 100%; max-width: 430px; padding: 48px 24px; }
  svg { display: block; margin-bottom: 16px; color: #1d6a43; }
  h1 {
    margin: 0 0 12px; font-family: "Noto Serif Armenian", "Noto Serif", Georgia, serif;
    font-stretch: 75%; font-weight: 600; font-size: 2.375rem; line-height: 1.1; text-wrap: balance;
  }
  p { margin: 0; font-size: 1.25rem; color: #4a5b51; }
</style>
</head>
<body>
<main>
<svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#e2eee6"/><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h1.5M17 14v1.5M14 17h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
<h1>${escape(text.title)}</h1>
<p>${escape(text.body)}</p>
</main>
</body>
</html>
`;
}

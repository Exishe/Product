import { describe, expect, it } from "vitest";
import { tableErrorHtml } from "./table-error-page";

describe("tableErrorHtml", () => {
  it("is a complete page in the visitor's language that needs no script", () => {
    const html = tableErrorHtml("ru", { title: "Этот QR-код больше не работает.", body: "Попросите официанта помочь." });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("<h1>Этот QR-код больше не работает.</h1>");
    expect(html).toContain("<p>Попросите официанта помочь.</p>");
    expect(html).not.toContain("<script");
  });

  it("escapes the text", () => {
    const html = tableErrorHtml("en", { title: "<b>&", body: '"x"' });
    expect(html).toContain("<h1>&lt;b&gt;&amp;</h1>");
    expect(html).toContain("<p>&quot;x&quot;</p>");
  });

  it("has no reload or button unless asked to retry", () => {
    const html = tableErrorHtml("en", { title: "t", body: "b" });
    expect(html).not.toContain("http-equiv");
    expect(html).not.toContain('class="retry"');
  });

  it("reloads itself and offers a retry link on the busy page", () => {
    const html = tableErrorHtml("hy", { title: "t", body: "b" }, { label: "Փորձել նորից", seconds: 5 });
    expect(html).toContain('<meta http-equiv="refresh" content="5">');
    expect(html).toContain('<a class="retry" href="">Փորձել նորից</a>');
    expect(html).not.toContain("<script");
  });
});

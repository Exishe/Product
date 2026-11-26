import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import hy from "../../../../messages/hy.json";
import { MenuFallbackTextProvider, MenuLoadFailed, MenuSkeleton } from "./menu-fallback";

const menu = hy.guest.menu;
const text = {
  loading: menu.loading,
  title: menu.loadFailedTitle,
  body: menu.loadFailedBody,
  reload: menu.reload,
};

describe("the menu's loading and error screens", () => {
  it("the skeleton is busy and says so to a screen reader", () => {
    const html = renderToStaticMarkup(
      <MenuFallbackTextProvider value={text}>
        <MenuSkeleton />
      </MenuFallbackTextProvider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`role="status"`);
    expect(html).toContain("Ճաշացանկը բացվում է…");
  });

  it("the error screen has the title, the advice and one reload button", () => {
    const html = renderToStaticMarkup(
      <MenuFallbackTextProvider value={text}>
        <MenuLoadFailed />
      </MenuFallbackTextProvider>,
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Ճաշացանկը չբացվեց");
    expect(html).toContain("կանչեք մատուցողին։");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Թարմացնել");
  });
});

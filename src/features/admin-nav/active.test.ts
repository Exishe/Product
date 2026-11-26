import { describe, expect, it } from "vitest";
import { activeHref, activeLink } from "./active";

const hrefs = [
  "/admin/dashboard",
  "/admin/menu",
  "/admin/menu/import",
  "/admin/tables",
  "/admin/staff",
  "/admin/export",
];

describe("activeHref", () => {
  it("picks the longest matching link", () => {
    expect(activeHref("/admin/menu", hrefs)).toBe("/admin/menu");
    expect(activeHref("/admin/menu/import/123", hrefs)).toBe("/admin/menu/import");
    expect(activeHref("/admin/menu/options", hrefs)).toBe("/admin/menu");
    expect(activeHref("/admin/tables/print", hrefs)).toBe("/admin/tables");
  });

  it("does not match a prefix of a word", () => {
    expect(activeHref("/admin/menus", hrefs)).toBeNull();
  });

  it("matches nothing on the admin home", () => {
    expect(activeHref("/admin", hrefs)).toBeNull();
  });
});

describe("activeLink", () => {
  const links = [
    { href: "/admin" },
    { href: "/admin/dashboard", also: ["/admin/reports", "/admin/export"] },
    { href: "/admin/menu" },
  ];

  it("marks Home only on the home page itself", () => {
    expect(activeLink("/admin", links)).toBe("/admin");
    expect(activeLink("/admin/menu/import", links)).toBe("/admin/menu");
  });

  it("lets a link stand for pages outside its folder", () => {
    expect(activeLink("/admin/reports", links)).toBe("/admin/dashboard");
    expect(activeLink("/admin/export", links)).toBe("/admin/dashboard");
    expect(activeLink("/admin/dashboard/menu", links)).toBe("/admin/dashboard");
  });
});

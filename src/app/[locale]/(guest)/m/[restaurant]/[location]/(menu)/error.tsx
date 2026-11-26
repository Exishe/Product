"use client";

import { MenuLoadFailed } from "@/features/menu/guest-menu/menu-fallback";

// The menu could not be rendered at all (a database that does not answer is
// already turned into the calm "busy" page by the page itself, ADR-089): a
// short message and one button that reloads the page, never a bare error.
export default function MenuError() {
  return <MenuLoadFailed />;
}

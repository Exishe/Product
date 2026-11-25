import { MenuSkeleton } from "@/features/menu/guest-menu/menu-fallback";

// While the published menu is on its way (a slow database can take a while):
// the menu's outline in the page colours instead of a blank tab.
export default function MenuLoading() {
  return <MenuSkeleton />;
}

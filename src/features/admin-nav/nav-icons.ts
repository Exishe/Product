import {
  BookOpen,
  Building2,
  ChartColumn,
  ChartLine,
  Download,
  House,
  Palette,
  QrCode,
  ScanText,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";

// One Lucide icon per admin section, shared by the navigation and the home page.
export const NAV_ICONS = {
  home: House,
  dashboard: ChartColumn,
  reports: ChartLine,
  menu: BookOpen,
  import: ScanText,
  tables: QrCode,
  staff: Users,
  look: Palette,
  telegram: Send,
  export: Download,
  platform: Building2,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof NAV_ICONS;

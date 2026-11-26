import {
  BookOpen,
  Building2,
  CreditCard,
  ChartColumn,
  ChartLine,
  Download,
  Palette,
  QrCode,
  ScanText,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";

// One Lucide icon per admin section, shared by the navigation and the home page.
export const NAV_ICONS = {
  dashboard: ChartColumn,
  reports: ChartLine,
  menu: BookOpen,
  import: ScanText,
  tables: QrCode,
  staff: Users,
  look: Palette,
  telegram: Send,
  pos: CreditCard,
  export: Download,
  platform: Building2,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof NAV_ICONS;

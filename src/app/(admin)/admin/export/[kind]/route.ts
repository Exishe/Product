import { getTranslations } from "next-intl/server";
import { toCsv } from "@/features/export/csv";
import {
  COLUMN_KEYS,
  EXPORT_KINDS,
  loadExport,
  type Columns,
  type ExportKind,
} from "@/features/export/load.server";
import { requireMember } from "@/lib/auth/require-member";

// CSV of the caller's café: menu, orders or bills (ADR-036). Owners and managers.
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  const me = await requireMember(["owner", "manager"]);
  const t = await getTranslations("billing.export.columns");
  const columns = Object.fromEntries(COLUMN_KEYS.map((c) => [c, t(c)])) as Columns;
  const sheet = await loadExport(kind as ExportKind, me.restaurantId, columns);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(sheet.header, sheet.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pativ-${kind}-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addTable, reprintTable, updateTable, type TableResult } from "./actions";
import type { Floor, FloorTable } from "./load.server";
import { nextTableLabel } from "./schema";

const field = "h-12 w-full rounded-input border border-line-strong bg-white px-3";
const button = "inline-flex min-h-12 items-center justify-center rounded-input px-4 font-semibold";
const primary = `${button} bg-tarragon text-white disabled:opacity-60`;
const secondary = `${button} border border-line-strong bg-white text-ink`;

type Notice = { kind: "ok" | "error"; text: string } | null;

function TableFields({
  floor,
  label,
  seats,
  areaId,
  onChange,
  idPrefix,
}: {
  floor: Floor;
  label: string;
  seats: string;
  areaId: string;
  onChange: (patch: Partial<{ label: string; seats: string; areaId: string }>) => void;
  idPrefix: string;
}) {
  const t = useTranslations("tables");
  return (
    <>
      <label className="flex flex-col gap-1" htmlFor={`${idPrefix}-label`}>
        <span className="text-sm font-semibold text-muted">{t("label")}</span>
        <input
          id={`${idPrefix}-label`}
          className={field}
          value={label}
          maxLength={12}
          required
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor={`${idPrefix}-seats`}>
        <span className="text-sm font-semibold text-muted">{t("seats")}</span>
        <input
          id={`${idPrefix}-seats`}
          className={`${field} num`}
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={seats}
          required
          onChange={(e) => onChange({ seats: e.target.value })}
        />
      </label>
      {floor.areas.length > 0 && (
        <label className="flex flex-col gap-1" htmlFor={`${idPrefix}-area`}>
          <span className="text-sm font-semibold text-muted">{t("area")}</span>
          <select id={`${idPrefix}-area`} className={field} value={areaId} onChange={(e) => onChange({ areaId: e.target.value })}>
            <option value="">{t("noArea")}</option>
            {floor.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

function errorText(t: ReturnType<typeof useTranslations<"tables">>, result: TableResult): string {
  if (result.ok) return "";
  return result.error === "label_taken" ? t("labelTaken") : result.error === "invalid" ? t("invalid") : t("error");
}

function TableRow({ floor, table }: { floor: Floor; table: FloorTable }) {
  const t = useTranslations("tables");
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState({ label: table.label, seats: String(table.seats), areaId: table.areaId ?? "" });
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const area = floor.areas.find((a) => a.id === table.areaId)?.name;

  const save = () =>
    start(async () => {
      const result = await updateTable(table.id, draft);
      if (result.ok) {
        setMode("view");
        setNotice(null);
      } else setNotice({ kind: "error", text: errorText(t, result) });
    });

  const reprint = () =>
    start(async () => {
      const result = await reprintTable(table.id);
      setMode("view");
      setNotice(result.ok ? { kind: "ok", text: t("reprinted") } : { kind: "error", text: errorText(t, result) });
    });

  return (
    <li className="flex flex-col gap-3 border-b border-line py-4" data-testid="table-row" data-table-label={table.label}>
      {mode === "edit" ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <TableFields
            floor={floor}
            idPrefix={`table-${table.id}`}
            {...draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={pending}>
              {pending ? t("saving") : t("save")}
            </button>
            <button type="button" className={secondary} onClick={() => setMode("view")}>
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="display-face text-2xl leading-tight break-words">{t("tableName", { label: table.label })}</span>
            <span className="text-sm text-muted">
              {t("seatsCount", { count: table.seats })}
              {area ? ` · ${area}` : null}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setDraft({ label: table.label, seats: String(table.seats), areaId: table.areaId ?? "" });
                setNotice(null);
                setMode("edit");
              }}
            >
              {t("edit")}
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setNotice(null);
                setMode("confirm");
              }}
            >
              {t("reprint")}
            </button>
            <Link href={`/admin/tables/print?table=${table.id}`} className={secondary}>
              {t("printOne")}
            </Link>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="flex flex-col gap-3 rounded-sheet border border-pomegranate bg-pom-tint p-4" role="alert">
          <p>{t("reprintWarning")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${button} bg-pomegranate text-white disabled:opacity-60`} disabled={pending} onClick={reprint}>
              {t("reprintConfirm")}
            </button>
            <button type="button" className={secondary} onClick={() => setMode("view")}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "text-pomegranate" : "text-tarragon"}>
          {notice.text}
        </p>
      )}
    </li>
  );
}

export function TablesEditor({ floor }: { floor: Floor }) {
  const t = useTranslations("tables");
  const [draft, setDraft] = useState({ label: nextTableLabel(floor.tables.map((x) => x.label)), seats: "2", areaId: "" });
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const result = await addTable(draft);
      if (result.ok) {
        setNotice({ kind: "ok", text: t("added", { label: draft.label.trim() }) });
        setDraft((d) => ({ ...d, label: nextTableLabel([...floor.tables.map((x) => x.label), d.label.trim()]) }));
      } else setNotice({ kind: "error", text: errorText(t, result) });
    });

  return (
    <div className="flex flex-col gap-8">
      <form
        className="grid gap-3 rounded-sheet border border-line bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TableFields floor={floor} idPrefix="new-table" {...draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <button type="submit" className={primary} disabled={pending}>
          {pending ? t("adding") : t("add")}
        </button>
        <p
          className={`sm:col-span-4 ${notice?.kind === "error" ? "text-pomegranate" : "text-tarragon"}`}
          role={notice?.kind === "error" ? "alert" : "status"}
        >
          {notice?.text}
        </p>
      </form>

      {floor.tables.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul>
          {floor.tables.map((table) => (
            <TableRow key={table.id} floor={floor} table={table} />
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { clsx } from "clsx";
import {
  CircleAlert,
  CircleCheck,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useToast } from "@/features/admin-ui/toast";
import { button as btn, fieldLabel, input } from "@/features/admin-ui/styles";
import { addTable, reprintTable, updateTable, type TableResult } from "./actions";
import type { Floor, FloorTable } from "./load.server";
import { nextTableLabel } from "./schema";

const field = input;
const primary = btn("primary");
const secondary = btn("secondary", "min-h-11 text-[0.9375rem]");

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
        <span className={fieldLabel}>{t("label")}</span>
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
        <span className={fieldLabel}>{t("seats")}</span>
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
          <span className={fieldLabel}>{t("area")}</span>
          <select
            id={`${idPrefix}-area`}
            className={field}
            value={areaId}
            onChange={(e) => onChange({ areaId: e.target.value })}
          >
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
  return result.error === "label_taken"
    ? t("labelTaken")
    : result.error === "invalid"
      ? t("invalid")
      : t("error");
}

function TableRow({ floor, table }: { floor: Floor; table: FloorTable }) {
  const t = useTranslations("tables");
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState({
    label: table.label,
    seats: String(table.seats),
    areaId: table.areaId ?? "",
  });
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
      setNotice(
        result.ok ? { kind: "ok", text: t("reprinted") } : { kind: "error", text: errorText(t, result) },
      );
    });

  return (
    <li
      className="border-staff-sep flex flex-col gap-3 border-b px-4 py-3 last:border-0"
      data-testid="table-row"
      data-table-label={table.label}
    >
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
            <button type="button" className={btn("secondary")} onClick={() => setMode("view")}>
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
            <span
              aria-hidden="true"
              className="bg-staff-fill text-staff-label2 grid size-11 shrink-0 place-items-center rounded-xl"
            >
              <QrCode className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[1.0625rem] leading-tight font-semibold break-words">
                {t("tableName", { label: table.label })}
              </span>
              <span className="text-staff-label2 text-[0.9375rem]">
                {t("seatsCount", { count: table.seats })}
                {area ? ` · ${area}` : null}
              </span>
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
              <Pencil aria-hidden="true" className="!size-4" />
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
              <RefreshCw aria-hidden="true" className="!size-4" />
              {t("reprint")}
            </button>
            <Link href={`/admin/tables/print?table=${table.id}`} className={secondary}>
              <Printer aria-hidden="true" className="!size-4" />
              {t("printOne")}
            </Link>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="bg-pom-tint text-ink flex items-start gap-3 rounded-2xl p-4" role="alert">
          <TriangleAlert aria-hidden="true" className="text-pomegranate mt-0.5 size-5 shrink-0" />
          <div className="flex min-w-0 flex-col gap-3">
            <p className="m-0">{t("reprintWarning")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn("destructive")} disabled={pending} onClick={reprint}>
                {t("reprintConfirm")}
              </button>
              <button type="button" className={btn("secondary")} onClick={() => setMode("view")}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={clsx(
            "m-0 flex items-start gap-2 text-[0.9375rem] font-semibold",
            notice.kind === "error" ? "text-pomegranate" : "text-tarragon",
          )}
        >
          {notice.kind === "error" ? (
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          {notice.text}
        </p>
      )}
    </li>
  );
}

export function TablesEditor({ floor }: { floor: Floor }) {
  const t = useTranslations("tables");
  const toast = useToast();
  const [draft, setDraft] = useState({
    label: nextTableLabel(floor.tables.map((x) => x.label)),
    seats: "2",
    areaId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const result = await addTable(draft);
      if (result.ok) {
        setError(null);
        toast(t("added", { label: draft.label.trim() }));
        setDraft((d) => ({
          ...d,
          label: nextTableLabel([...floor.tables.map((x) => x.label), d.label.trim()]),
        }));
      } else setError(errorText(t, result));
    });

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TableFields
          floor={floor}
          idPrefix="new-table"
          {...draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
        <button type="submit" className={primary} disabled={pending}>
          <Plus aria-hidden="true" />
          {pending ? t("adding") : t("add")}
        </button>
        {error && (
          <p
            className="text-pomegranate m-0 flex items-center gap-2 font-semibold sm:col-span-4"
            role="alert"
          >
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </form>

      {floor.tables.length === 0 ? (
        <p className="text-staff-label2 m-0 flex items-center gap-3 rounded-2xl bg-white px-4 py-6 text-[1.0625rem]">
          <QrCode aria-hidden="true" className="size-5 shrink-0" />
          {t("empty")}
        </p>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-2xl bg-white p-0">
          {floor.tables.map((table) => (
            <TableRow key={table.id} floor={floor} table={table} />
          ))}
        </ul>
      )}
    </div>
  );
}

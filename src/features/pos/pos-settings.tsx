"use client";

import { clsx } from "clsx";
import { ChevronDown, CircleAlert, CircleCheck, Download, Info, KeyRound, Plug, RefreshCw, RotateCcw, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Notice, Section } from "@/features/admin-ui/page";
import { button, card, chip, fieldLabel, input, list, table as tbl, textAction } from "@/features/admin-ui/styles";
import type { Locale } from "@/i18n/routing";
import { formatDate, formatTime } from "@/lib/format/date";
import {
  checkPosConnection,
  loadPosMenu,
  retryPosSend,
  savePosConnection,
  savePosMatches,
  savePosSecret,
  sendPosTest,
  setPosActive,
  type ActionResult,
  type CheckResult,
} from "./actions";
import { POS_VENDORS, type PosCatalog, type PosSettings, type PosVendor } from "./adapters/types";
import type { DishView, PosAdminData, PosSendView } from "./load.server";
import type { DishMatch } from "./match";

const DEFAULT_BASE: Record<string, string> = {
  iiko: "https://api-ru.iiko.services",
  syrve: "https://api-eu.syrve.live",
};

type TableMatch = PosAdminData["tableMatches"][number];
type Flash = { tone: "ok" | "alert"; text: string } | null;

// The owner's POS page (ADR-093): pick the POS, save its key (write-only),
// check the connection, match dishes, switch sending on, send a test order and
// watch the recent sends. Every step is a server action as the owner.
export function PosSettingsPanel({ data }: { data: PosAdminData }) {
  const t = useTranslations("pos");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<Flash>(null);
  const conn = data.connection;

  const [vendor, setVendor] = useState<PosVendor>(conn?.vendor ?? "test");
  const sameVendor = conn?.vendor === vendor;
  const [url, setUrl] = useState(conn?.settings.url ?? "");
  const [baseUrl, setBaseUrl] = useState(conn?.settings.base_url ?? "");
  const [phone, setPhone] = useState(conn?.settings.phone ?? "");
  const [secret, setSecret] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [org, setOrg] = useState(conn?.settings.organization_id ?? "");
  const [group, setGroup] = useState(conn?.settings.terminal_group_id ?? "");
  const [spot, setSpot] = useState(conn?.settings.spot_id ?? "");
  const [catalog, setCatalog] = useState<PosCatalog | null>(null);
  const [matches, setMatches] = useState<DishMatch[]>(data.matches);
  const [tableMatches, setTableMatches] = useState<TableMatch[]>(data.tableMatches);

  const errorText = (r: Extract<ActionResult<unknown>, { ok: false }>) =>
    t(`errors.${r.error}`, { detail: r.detail ?? "" });

  function run<T>(action: () => Promise<ActionResult<T>>, onOk?: (data: T) => void, okText?: string) {
    setFlash(null);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setFlash({ tone: "alert", text: errorText(res) });
        return;
      }
      onOk?.(res.data);
      if (okText) setFlash({ tone: "ok", text: okText });
      router.refresh();
    });
  }

  // Settings as saved, with the vendor's choices kept when the vendor stays.
  const settings = (extra: PosSettings = {}): PosSettings => {
    const kept = sameVendor ? conn?.settings ?? {} : {};
    const s: PosSettings = { ...kept, ...extra };
    if (vendor === "webhook") s.url = url;
    if (vendor === "iiko" || vendor === "syrve") s.base_url = baseUrl;
    if (vendor === "poster") s.phone = phone;
    return s;
  };

  const matched = new Map(matches.map((m) => [m.itemId, m]));
  const unmatched = data.dishes.filter((d) => !matched.has(d.id));
  const needsMenu = conn && (conn.vendor === "iiko" || conn.vendor === "syrve" || conn.vendor === "poster");

  return (
    <div className="flex flex-col gap-6" data-testid="pos-settings">
      {/* What isn't sent: a plain info line on the page, not a grey box. */}
      <p className="text-staff-label2 m-0 flex max-w-[60ch] items-start gap-2 text-[0.9375rem] leading-normal">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t("notInV1")}
      </p>

      {flash && (
        <Notice tone={flash.tone} role={flash.tone === "alert" ? "alert" : "status"} icon={flash.tone === "ok" ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}>
          <p className="m-0">{flash.text}</p>
        </Notice>
      )}

      {/* 1. Which POS */}
      <Section title={t("vendorTitle")} id="pos-vendor">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("vendorLabel")}</span>
          <select
            className={input}
            value={vendor}
            onChange={(e) => setVendor(e.target.value as PosVendor)}
            data-testid="pos-vendor"
          >
            {POS_VENDORS.map((v) => (
              <option key={v} value={v}>
                {t(`vendors.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-staff-label2 m-0 text-[0.9375rem]">{t(`vendorHints.${vendor}`)}</p>
        {vendor === "webhook" && (
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("url")}</span>
            <input className={input} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </label>
        )}
        {(vendor === "iiko" || vendor === "syrve") && (
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("baseUrl")}</span>
            <input className={input} type="url" inputMode="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE[vendor]} />
            <span className="text-staff-label2 text-[0.875rem]">{t("baseUrlHint", { url: DEFAULT_BASE[vendor] ?? "" })}</span>
          </label>
        )}
        {vendor === "poster" && (
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t("phone")}</span>
            <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <span className="text-staff-label2 text-[0.875rem]">{t("phoneHint")}</span>
          </label>
        )}
        <div>
          <button
            type="button"
            className={button("primary")}
            disabled={pending}
            onClick={() => run(() => savePosConnection(vendor, settings()), undefined, t("saved"))}
          >
            {t("save")}
          </button>
        </div>
      </Section>

      {/* 2. The key: write-only */}
      {conn && conn.vendor !== "test" && (
        <Section title={t("secretTitle")} id="pos-secret">
          <span className={clsx(chip.base, conn.hasSecret ? chip.ok : chip.wait, "self-start")} data-testid="pos-secret-state">
            <KeyRound aria-hidden="true" />
            {conn.hasSecret ? t("secretSaved") : t("secretMissing")}
          </span>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>{t(`secretLabel.${conn.vendor}`)}</span>
            <input
              className={input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              placeholder={t("secretPlaceholder")}
              onChange={(e) => setSecret(e.target.value)}
            />
            <span className="text-staff-label2 text-[0.875rem]">{t("secretHint")}</span>
          </label>
          <div>
            <button
              type="button"
              className={button("secondary")}
              disabled={pending || secret.trim().length === 0}
              onClick={() => run(() => savePosSecret(conn.id, secret), () => setSecret(""), t("saved"))}
            >
              {t("saveSecret")}
            </button>
          </div>
        </Section>
      )}

      {/* 3. Check the connection and choose where orders go */}
      {conn && conn.vendor !== "test" && (
        <Section title={t("checkTitle")} id="pos-check">
          <div>
            <button
              type="button"
              className={button("secondary")}
              disabled={pending || !conn.hasSecret}
              onClick={() => run(() => checkPosConnection(conn.id), (c) => setCheck(c), t("checkOk"))}
            >
              <Plug aria-hidden="true" />
              {t("check")}
            </button>
          </div>
          {check && (check.vendor === "iiko" || check.vendor === "syrve") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabel}>{t("organization")}</span>
                <select className={input} value={org} onChange={(e) => setOrg(e.target.value)}>
                  <option value="">{t("choose")}</option>
                  {check.account.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabel}>{t("terminalGroup")}</span>
                <select className={input} value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">{t("choose")}</option>
                  {check.account.terminalGroups
                    .filter((g) => !org || g.organizationId === org)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          {check && check.vendor === "poster" && (
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabel}>{t("spot")}</span>
              <select className={input} value={spot} onChange={(e) => setSpot(e.target.value)}>
                <option value="">{t("choose")}</option>
                {check.spots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {check && check.vendor !== "webhook" && check.vendor !== "test" && (
            <div>
              <button
                type="button"
                className={button("primary")}
                disabled={pending}
                onClick={() => {
                  const c = check;
                  const extra: PosSettings =
                    c.vendor === "poster"
                      ? { spot_id: spot, spot_name: c.spots.find((s) => s.id === spot)?.name ?? "" }
                      : c.vendor === "iiko" || c.vendor === "syrve"
                        ? {
                            organization_id: org,
                            organization_name: c.account.organizations.find((o) => o.id === org)?.name ?? "",
                            terminal_group_id: group,
                            terminal_group_name: c.account.terminalGroups.find((g) => g.id === group)?.name ?? "",
                          }
                        : {};
                  run(() => savePosConnection(conn.vendor, settings(extra)), undefined, t("saved"));
                }}
              >
                {t("saveChoice")}
              </button>
            </div>
          )}
          {!check && (conn.settings.organization_name || conn.settings.spot_name) && (
            <p className="m-0 text-[0.9375rem]">
              {[conn.settings.organization_name, conn.settings.terminal_group_name, conn.settings.spot_name].filter(Boolean).join(" · ")}
            </p>
          )}
        </Section>
      )}

      {/* 4. Dish matching */}
      {conn && needsMenu && (
        <Section title={t("menuTitle")} hint={t("menuHint")} id="pos-menu">
          {unmatched.length > 0 ? (
            <Notice tone="wait" icon={<CircleAlert aria-hidden="true" />} testId="pos-unmatched">
              <strong>{t("notMatched", { count: unmatched.length })}</strong>
              <span className="text-[0.9375rem]">{t("notMatchedHint")}</span>
            </Notice>
          ) : (
            <Notice tone="ok" icon={<CircleCheck aria-hidden="true" />}>
              {t("allMatched")}
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button("secondary")}
              disabled={pending || !conn.hasSecret}
              onClick={() =>
                run(
                  () => loadPosMenu(conn.id),
                  (r) => {
                    setCatalog(r.catalog);
                    setMatches(r.matches);
                    setTableMatches(r.tableMatches);
                  },
                )
              }
            >
              <Download aria-hidden="true" />
              {t("loadMenu")}
            </button>
            <button
              type="button"
              className={button("primary")}
              disabled={pending || !catalog}
              onClick={() => run(() => savePosMatches(conn.id, matches, tableMatches), undefined, t("matchesSaved"))}
            >
              {t("saveMatches")}
            </button>
          </div>
          <MatchTable dishes={data.dishes} catalog={catalog} matches={matches} onChange={setMatches} />
          {(conn.vendor === "iiko" || conn.vendor === "syrve") && data.tables.length > 0 && (
            <TableMatchList tables={data.tables} catalog={catalog} matches={tableMatches} onChange={setTableMatches} />
          )}
        </Section>
      )}

      {/* 5. On / off and a test order */}
      {conn && (
        <Section title={t("activeTitle")} id="pos-active">
          {/* The state and, while on, its quiet red "Turn off" on one line
              (as on Staff); then the group's actions. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="m-0 flex items-center gap-2 text-[1.0625rem] font-semibold" data-testid="pos-active-state">
              <span className={clsx(chip.base, conn.isActive ? chip.ok : chip.plain)}>{conn.isActive ? t("activeOn") : t("activeOff")}</span>
            </p>
            {conn.isActive && (
              <button
                type="button"
                className={textAction("danger", "-mr-2")}
                disabled={pending}
                onClick={() => run(() => setPosActive(conn.id, false))}
              >
                {t("turnOff")}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!conn.isActive && (
              <button
                type="button"
                className={button("primary", "max-sm:w-full")}
                disabled={pending}
                onClick={() => run(() => setPosActive(conn.id, true))}
              >
                {t("turnOn")}
              </button>
            )}
            <button
              type="button"
              className={button("secondary", "max-sm:w-full")}
              disabled={pending || (conn.vendor !== "test" && !conn.hasSecret)}
              onClick={() => run(() => sendPosTest(conn.id), undefined, t("testQueued"))}
            >
              <Send aria-hidden="true" />
              {t("sendTest")}
            </button>
          </div>
        </Section>
      )}

      {/* 6. Recent sends */}
      {conn && (
        <Section
          title={t("recentTitle")}
          id="pos-recent"
          bare
          actions={
            <button type="button" className={textAction()} onClick={() => router.refresh()}>
              <RefreshCw aria-hidden="true" />
              {t("refresh")}
            </button>
          }
        >
          {data.recent.length === 0 ? (
            <p className={clsx(card, "text-staff-label2 m-0")}>{t("recentEmpty")}</p>
          ) : (
            <ul className={clsx(list.wrap, "border-staff-sep border-t")}>
              {data.recent.map((s) => (
                <SendRow key={s.id} send={s} disabled={pending} onRetry={() => run(() => retryPosSend(s.id))} />
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function statusChip(status: PosSendView["status"]) {
  return status === "sent" ? chip.ok : status === "failed" || status === "dead" ? chip.alert : status === "skipped" ? chip.plain : chip.wait;
}

function SendRow({ send, disabled, onRetry }: { send: PosSendView; disabled: boolean; onRetry: () => void }) {
  const t = useTranslations("pos");
  const locale = useLocale() as Locale;
  const at = new Date(send.createdAt);
  // Café time in the admin's format (26.11.2026, 10:22), the same on the
  // server and in the browser.
  const when = [formatDate(at, locale), formatTime(at)].join(", ");
  const title = send.isTest ? t("testOrder", { number: send.orderNumber ?? "" }) : t("order", { number: send.orderNumber ?? "" });
  return (
    <li className={clsx(list.item, "gap-1.5 pb-1")} data-testid="pos-send" data-status={send.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {title}
          {send.tableLabel && <span className="text-staff-label2 font-normal"> · {t("tableShort", { label: send.tableLabel })}</span>}
        </strong>
        <span className={clsx(chip.base, statusChip(send.status))}>{t(`status.${send.status}`)}</span>
      </div>
      <p className="text-staff-label2 m-0 text-[0.875rem]">
        <time dateTime={send.createdAt}>{when}</time>
        {send.externalOrderId && <> · {t("externalId", { id: send.externalOrderId })}</>}
      </p>
      {send.lastError && (send.status === "failed" || send.status === "dead") && (
        <p className="text-pomegranate m-0 text-[0.9375rem] break-words">{send.lastError}</p>
      )}
      {(send.status === "failed" || send.status === "dead") && (
        <div className="-ml-2">
          <button type="button" className={textAction()} disabled={disabled} onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      )}
      {/* The admin's disclosure row: label on the left, chevron on the right. */}
      <details className="group">
        <summary className="text-ink flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-label font-semibold [&::-webkit-details-marker]:hidden">
          {t("showPayload")}
          <ChevronDown
            aria-hidden="true"
            className="text-staff-label2 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <pre className="bg-staff-fill mb-3 max-h-80 overflow-auto rounded-xl p-3 text-[0.8125rem] leading-snug" lang="und">
          {JSON.stringify(send.payload, null, 2)}
        </pre>
      </details>
    </li>
  );
}

function MatchTable({
  dishes,
  catalog,
  matches,
  onChange,
}: {
  dishes: DishView[];
  catalog: PosCatalog | null;
  matches: DishMatch[];
  onChange: (m: DishMatch[]) => void;
}) {
  const t = useTranslations("pos");
  const byItem = new Map(matches.map((m) => [m.itemId, m]));
  const products = useMemo(() => [...(catalog?.products ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [catalog]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const setProduct = (dish: DishView, productId: string) => {
    const rest = matches.filter((m) => m.itemId !== dish.id);
    const p = productById.get(productId);
    onChange(p ? [...rest, { itemId: dish.id, externalId: p.id, externalName: p.name, auto: false, modifiers: {} }] : rest);
  };
  const setModifier = (dish: DishView, modId: string, value: string) => {
    const m = byItem.get(dish.id);
    if (!m) return;
    const p = productById.get(m.externalId);
    const opt = p?.modifiers.find((x) => `${x.groupId ?? ""}|${x.id}` === value);
    const mods = { ...m.modifiers };
    if (opt) mods[modId] = { external_id: opt.id, group_id: opt.groupId };
    else delete mods[modId];
    onChange(matches.map((x) => (x.itemId === dish.id ? { ...x, modifiers: mods, auto: false } : x)));
  };

  return (
    <div className={clsx(tbl.wrap, "overflow-x-auto")}>
      <table className={tbl.table}>
        <thead className={tbl.head}>
          <tr>
            <th className={tbl.th}>{t("dish")}</th>
            <th className={tbl.th}>{t("posProduct")}</th>
          </tr>
        </thead>
        <tbody>
          {dishes.map((d) => {
            const m = byItem.get(d.id);
            const p = m ? productById.get(m.externalId) : undefined;
            return (
              <tr key={d.id} className={tbl.row} data-testid="pos-match-row" data-matched={m ? "1" : "0"}>
                <td className={clsx(tbl.td, "min-w-40")}>
                  <span lang="hy">{d.name}</span>
                  {d.modifiers.length > 0 && m && (
                    <span className="text-staff-label2 block text-[0.8125rem]">{t("options")}</span>
                  )}
                </td>
                <td className={clsx(tbl.td, "min-w-56")}>
                  <div className="flex flex-col gap-1.5">
                    <select
                      className={clsx(input, !m && "border-amber-text")}
                      value={m?.externalId ?? ""}
                      aria-label={d.name}
                      onChange={(e) => setProduct(d, e.target.value)}
                    >
                      <option value="">{t("none")}</option>
                      {m && !productById.has(m.externalId) && <option value={m.externalId}>{m.externalName}</option>}
                      {products.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    {m?.auto && <span className={clsx(chip.base, chip.ok, "self-start")}>{t("auto")}</span>}
                    {m &&
                      d.modifiers.map((mod) => {
                        const cur = m.modifiers[mod.id];
                        return (
                          <label key={mod.id} className="flex flex-col gap-1 pl-3">
                            <span className="text-staff-label2 text-[0.8125rem]" lang="hy">
                              {mod.names[0] ?? ""}
                            </span>
                            <select
                              className={input}
                              value={cur ? `${cur.group_id ?? ""}|${cur.external_id}` : ""}
                              onChange={(e) => setModifier(d, mod.id, e.target.value)}
                            >
                              <option value="">{t("none")}</option>
                              {cur && !p?.modifiers.some((x) => x.id === cur.external_id) && (
                                <option value={`${cur.group_id ?? ""}|${cur.external_id}`}>{cur.external_id}</option>
                              )}
                              {(p?.modifiers ?? []).map((x) => (
                                <option key={`${x.groupId ?? ""}|${x.id}`} value={`${x.groupId ?? ""}|${x.id}`}>
                                  {x.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableMatchList({
  tables,
  catalog,
  matches,
  onChange,
}: {
  tables: { id: string; label: string }[];
  catalog: PosCatalog | null;
  matches: TableMatch[];
  onChange: (m: TableMatch[]) => void;
}) {
  const t = useTranslations("pos");
  const byTable = new Map(matches.map((m) => [m.tableId, m]));
  const posTables = catalog?.tables ?? [];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[1.0625rem] font-semibold">{t("tablesTitle")}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {tables.map((tb) => {
          const m = byTable.get(tb.id);
          return (
            <label key={tb.id} className="flex flex-col gap-1">
              <span className={fieldLabel}>{t("table", { label: tb.label })}</span>
              <select
                className={input}
                value={m?.externalId ?? ""}
                onChange={(e) => {
                  const p = posTables.find((x) => x.id === e.target.value);
                  const rest = matches.filter((x) => x.tableId !== tb.id);
                  onChange(p ? [...rest, { tableId: tb.id, externalId: p.id, externalName: p.section ? `${p.section} · ${p.name}` : p.name }] : rest);
                }}
              >
                <option value="">{t("none")}</option>
                {m && !posTables.some((x) => x.id === m.externalId) && <option value={m.externalId}>{m.externalName}</option>}
                {posTables.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.section ? `${x.section} · ${x.name}` : x.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}

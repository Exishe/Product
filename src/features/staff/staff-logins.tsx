"use client";

import { clsx } from "clsx";
import { Ban, CircleAlert, CircleCheck, Clock, Copy, KeyRound, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { button, chip, fieldLabel, input } from "@/features/admin-ui/styles";
import { useToast } from "@/features/admin-ui/toast";
import {
  createStaffLogin,
  setStaffLoginActive,
  setStaffPassword,
  type CreateLoginState,
  type LoginError,
  type SetPasswordState,
} from "./login-actions";

export type StaffLoginRow = {
  memberId: string;
  username: string;
  role: "waiter" | "kitchen";
  stationName: string | null;
  isActive: boolean;
  passwordSet: boolean;
  lastSignIn: string | null; // already formatted for the owner's language
};

// The password is on screen once: nothing stores it in clear text.
function PasswordBox({ username, password }: { username: string; password: string }) {
  const t = useTranslations("staff.logins");
  const toast = useToast();
  return (
    <div className="bg-staff-bg flex flex-col gap-2 rounded-xl p-4" aria-live="polite">
      <p className="m-0 text-[0.9375rem] font-semibold break-words">{t("passwordShown", { username })}</p>
      <div className="flex items-center gap-2">
        <output
          data-testid="staff-password"
          className="num min-w-0 flex-1 text-[1.75rem] leading-tight font-bold tracking-[0.08em] break-all"
        >
          {password}
        </output>
        <button
          type="button"
          aria-label={t("copyPassword")}
          onClick={() =>
            void navigator.clipboard?.writeText(password).then(
              () => toast(t("copied")),
              () => toast(t("errors.failed"), "error"),
            )
          }
          className={button("secondary", "shrink-0 px-3")}
        >
          <Copy aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: LoginError }) {
  const t = useTranslations("staff.logins");
  return (
    <p role="alert" className="text-pomegranate m-0 flex items-start gap-2 font-semibold">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {t(`errors.${error}`)}
    </p>
  );
}

const initialPassword: SetPasswordState = { password: null, saved: false, error: null };

function SetPasswordForm({ row }: { row: StaffLoginRow }) {
  const t = useTranslations("staff.logins");
  const [state, action, pending] = useActionState(setStaffPassword, initialPassword);
  return (
    <details className="group min-w-0" data-testid="set-password">
      <summary
        className={button(
          "secondary",
          "w-fit cursor-pointer list-none px-4 [&::-webkit-details-marker]:hidden",
        )}
      >
        <KeyRound aria-hidden="true" />
        {t("setPassword")}
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="memberId" value={row.memberId} />
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("passwordOwn")}</span>
          <input
            name="password"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={72}
            className={clsx(input, "num")}
          />
          <span className="text-staff-label2 text-[0.9375rem]">{t("passwordOwnHint")}</span>
        </label>
        <button type="submit" disabled={pending} className={button("primary", "w-fit")}>
          {t("save")}
        </button>
        {state.error && <ErrorLine error={state.error} />}
        {state.password && <PasswordBox username={row.username} password={state.password} />}
        {state.saved && !state.password && (
          <p className="text-tarragon m-0 flex items-center gap-2 font-semibold" aria-live="polite">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
            {t("passwordSaved")}
          </p>
        )}
      </form>
    </details>
  );
}

export function StaffLoginList({
  rows,
  roleLabels,
}: {
  rows: StaffLoginRow[];
  roleLabels: Record<string, string>;
}) {
  const t = useTranslations("staff.logins");
  if (rows.length === 0) {
    return <p className="text-staff-label2 m-0 rounded-2xl bg-white px-4 py-5">{t("empty")}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map((row) => (
        <li
          key={row.memberId}
          data-testid="staff-login-row"
          data-username={row.username}
          className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5"
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-col">
              <span className="num text-[1.1875rem] font-bold break-all">{row.username}</span>
              <span className="text-staff-label2 text-[0.9375rem]">
                {roleLabels[row.role]}
                {row.stationName ? ` · ${row.stationName}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.isActive ? (
                <span className={clsx(chip.base, chip.ok)}>
                  <CircleCheck aria-hidden="true" />
                  {t("active")}
                </span>
              ) : (
                <span className={clsx(chip.base, chip.alert)}>
                  <Ban aria-hidden="true" />
                  {t("off")}
                </span>
              )}
              {!row.passwordSet && (
                <span className={clsx(chip.base, chip.wait)}>
                  <KeyRound aria-hidden="true" />
                  {t("needsPassword")}
                </span>
              )}
            </div>
          </div>
          <p className="text-staff-label2 num m-0 flex items-center gap-1.5 text-[0.9375rem]">
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            {row.lastSignIn ? t("lastSignIn", { time: row.lastSignIn }) : t("neverSignedIn")}
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <SetPasswordForm row={row} />
            <form action={setStaffLoginActive}>
              <input type="hidden" name="memberId" value={row.memberId} />
              <input type="hidden" name="active" value={row.isActive ? "false" : "true"} />
              <button type="submit" className={button(row.isActive ? "danger" : "secondary", "px-4")}>
                {row.isActive ? t("switchOff") : t("switchOn")}
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}

const initialCreate: CreateLoginState = { username: null, password: null, error: null };

export function CreateLoginForm({
  stations,
  prefix,
  roleLabels,
}: {
  stations: { id: string; name: string }[];
  prefix: string;
  roleLabels: Record<string, string>;
}) {
  const t = useTranslations("staff.logins");
  const [state, action, pending] = useActionState(createStaffLogin, initialCreate);
  const [role, setRole] = useState("kitchen");
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl bg-white p-4 sm:p-5">
      <h3 className="m-0 flex items-center gap-2 text-[1.25rem] font-bold">
        <UserPlus aria-hidden="true" className="text-ink size-5" />
        {t("createTitle")}
      </h3>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("createRole")}</span>
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={input}>
          <option value="kitchen">{roleLabels.kitchen}</option>
          <option value="waiter">{roleLabels.waiter}</option>
        </select>
      </label>
      {role === "kitchen" && stations.length > 1 && (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("createStation")}</span>
          <select name="stationId" defaultValue={stations[0]?.id} className={input}>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("createEnding")}</span>
        <input
          name="ending"
          type="text"
          maxLength={15}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={clsx(input, "num")}
        />
        <span className="text-staff-label2 text-[0.9375rem] break-all">
          {t("createEndingHint", { prefix })}
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("passwordOwn")}</span>
        <input
          name="password"
          type="text"
          maxLength={72}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={clsx(input, "num")}
        />
        <span className="text-staff-label2 text-[0.9375rem]">{t("passwordOwnHint")}</span>
      </label>
      <button type="submit" disabled={pending} className={button("primary")}>
        {t("createSubmit")}
      </button>
      {state.error && <ErrorLine error={state.error} />}
      {state.username && (
        <div className="flex flex-col gap-2" aria-live="polite" data-testid="created-login">
          <p className="m-0 flex flex-wrap items-center gap-x-2 font-semibold">
            <CircleCheck aria-hidden="true" className="text-tarragon size-4 shrink-0" />
            {t("created")} {t("username")}:{" "}
            <span className="num font-bold break-all" data-testid="created-username">
              {state.username}
            </span>
          </p>
          {state.password && <PasswordBox username={state.username} password={state.password} />}
        </div>
      )}
    </form>
  );
}

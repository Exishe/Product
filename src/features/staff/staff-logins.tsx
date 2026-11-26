"use client";

import { clsx } from "clsx";
import { Ban, ChefHat, CircleAlert, CircleCheck, Clock, Copy, HandPlatter, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { button, chip, fieldLabel, input, textAction } from "@/features/admin-ui/styles";
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
      <p className="m-0 text-label font-semibold break-words">{t("passwordShown", { username })}</p>
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
    // Closed it is one text action beside «Switch off»; open, the form takes the row.
    <details className="group min-w-0 open:basis-full" data-testid="set-password">
      <summary
        className={textAction("ink", "-ml-2 w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
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
          <span className="text-staff-label2 text-label">{t("passwordOwnHint")}</span>
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
    return <p className="text-staff-label2 m-0 text-name">{t("empty")}</p>;
  }
  // Hairline rows like every list in the admin: who, status, then the actions.
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => (
        <li
          key={row.memberId}
          data-testid="staff-login-row"
          data-username={row.username}
          className="border-staff-sep flex min-w-0 items-start gap-3 border-b py-4 first:pt-0"
        >
          {/* The same 40 px avatar as the people below, so every name on the
              page starts on one edge; the role's icon stands in for initials. */}
          <span
            aria-hidden="true"
            className="bg-staff-fill text-ink grid size-10 shrink-0 place-items-center rounded-full"
          >
            {row.role === "kitchen" ? <ChefHat className="size-5" /> : <HandPlatter className="size-5" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-col">
                <span className="num text-name font-semibold break-all">{row.username}</span>
                <span className="text-staff-label2 text-label">
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
            <p className="text-staff-label2 num m-0 flex items-center gap-1.5 text-label">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              {row.lastSignIn ? t("lastSignIn", { time: row.lastSignIn }) : t("neverSignedIn")}
            </p>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <SetPasswordForm row={row} />
              <form action={setStaffLoginActive}>
                <input type="hidden" name="memberId" value={row.memberId} />
                <input type="hidden" name="active" value={row.isActive ? "false" : "true"} />
                <button
                  type="submit"
                  className={row.isActive ? textAction("danger") : button("secondary", "px-4")}
                >
                  {row.isActive ? t("switchOff") : t("switchOn")}
                </button>
              </form>
            </div>
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
  // A waiter is the most common new person, so the form starts there.
  const [role, setRole] = useState("waiter");
  const usernameLead = `${prefix}-`;
  return (
    <form action={action} className="flex flex-col gap-5">
      {/* The sheet shows the title; the form keeps its own name for screen readers. */}
      <h3 className="sr-only">{t("createTitle")}</h3>
      {/* Two choices, both on screen: a segmented pair, not a picker. */}
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className={clsx(fieldLabel, "mb-1.5 p-0")}>{t("createRole")}</legend>
        <div className="bg-staff-fill grid grid-cols-2 gap-1 rounded-full p-1">
          {(["waiter", "kitchen"] as const).map((r) => (
            <label
              key={r}
              className={clsx(
                "has-[:focus-visible]:outline-ink flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-label font-semibold transition-colors duration-150 has-[:focus-visible]:outline-2 motion-reduce:transition-none [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
                role === r ? "text-ink bg-white shadow-sm" : "text-staff-label2",
              )}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="sr-only"
              />
              {r === "kitchen" ? <ChefHat aria-hidden="true" /> : <HandPlatter aria-hidden="true" />}
              {roleLabels[r]}
            </label>
          ))}
        </div>
      </fieldset>
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
        {/* The café's part of the username is fixed; the owner types the rest. */}
        <span className="border-staff-field focus-within:border-ink flex h-12 min-w-0 items-center rounded-xl border bg-white focus-within:outline-2 focus-within:-outline-offset-1">
          <span className="num text-staff-label2 bg-staff-bg flex h-full shrink-0 items-center rounded-l-xl px-3 text-name">
            {usernameLead}
          </span>
          <input
            name="ending"
            type="text"
            maxLength={15}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="num text-ink h-full min-w-0 flex-1 rounded-r-xl bg-transparent px-3 text-name outline-none"
          />
        </span>
        <span className="text-staff-label2 text-label">{t("createEndingHint", { prefix })}</span>
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
        <span className="text-staff-label2 text-label">{t("passwordOwnHint")}</span>
      </label>
      <button type="submit" disabled={pending} className={button("primary", "sm:w-fit")}>
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

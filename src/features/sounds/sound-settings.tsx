"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { button } from "@/features/admin-ui/styles";
import { play, SOUND_IDS, unlockedContext, type SoundId } from "@/lib/sounds/library";
import { saveStaffSounds } from "./actions";

export type StaffSounds = { orderSound: SoundId; callSound: SoundId };

// «Sounds» on the owner's home: one list of the built-in sounds for the
// kitchen's new orders and one for guest calls. Listen plays at once (the tap
// itself unlocks the browser's sound); Save stores the two choices for the café.
export function SoundSettingsForm({ initial }: { initial: StaffSounds }) {
  const t = useTranslations("sounds");
  const [orderSound, setOrderSound] = useState(initial.orderSound);
  const [callSound, setCallSound] = useState(initial.callSound);
  const [saved, setSaved] = useState<"idle" | "ok" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const audio = useRef<AudioContext | null>(null);

  const unchanged = orderSound === initial.orderSound && callSound === initial.callSound;

  function listen(id: SoundId) {
    audio.current = unlockedContext(audio.current);
    if (audio.current) play(audio.current, id);
  }

  return (
    <form
      className="flex flex-col gap-6"
      data-testid="sound-settings"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved("idle");
        startTransition(async () => setSaved((await saveStaffSounds(orderSound, callSound)) ? "ok" : "failed"));
      }}
    >
      <Picker
        name="order"
        label={t("settings.orderLabel")}
        hint={t("settings.orderHint")}
        value={orderSound}
        onChange={(id) => {
          setOrderSound(id);
          setSaved("idle");
        }}
        onListen={listen}
      />
      <Picker
        name="call"
        label={t("settings.callLabel")}
        hint={t("settings.callHint")}
        value={callSound}
        onChange={(id) => {
          setCallSound(id);
          setSaved("idle");
        }}
        onListen={listen}
      />
      <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("settings.note")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || unchanged}
          className={button("primary", "w-full sm:w-auto")}
          data-testid="sounds-save"
        >
          {t("settings.save")}
        </button>
        <p role="status" className="m-0 text-[0.9375rem] font-semibold">
          {saved === "ok" && <span className="text-tarragon">{t("settings.saved")}</span>}
          {saved === "failed" && <span className="text-pomegranate">{t("settings.failed")}</span>}
        </p>
      </div>
    </form>
  );
}

function Picker({
  name,
  label,
  hint,
  value,
  onChange,
  onListen,
}: {
  name: string;
  label: string;
  hint: string;
  value: SoundId;
  onChange: (id: SoundId) => void;
  onListen: (id: SoundId) => void;
}) {
  const t = useTranslations("sounds");
  const uid = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" data-testid={`sound-picker-${name}`}>
      <legend className="mb-1 p-0 text-[1.0625rem] font-semibold">{label}</legend>
      <p id={`${uid}-hint`} className="text-staff-label2 m-0 mb-2 text-[0.9375rem]">
        {hint}
      </p>
      <ul className="m-0 grid list-none gap-2 p-0" aria-describedby={`${uid}-hint`}>
        {SOUND_IDS.map((id) => {
          const inputId = `${uid}-${id}`;
          const chosen = value === id;
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-xl border bg-white pr-1 ${chosen ? "border-ink" : "border-staff-sep"}`}
            >
              <label htmlFor={inputId} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 pl-3 text-[1.0625rem]">
                <input
                  id={inputId}
                  type="radio"
                  name={`${uid}-${name}`}
                  checked={chosen}
                  onChange={() => onChange(id)}
                  className="accent-ink size-5 shrink-0"
                  data-testid={`sound-${name}-${id}`}
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">{t(`names.${id}`)}</span>
              </label>
              <button
                type="button"
                onClick={() => onListen(id)}
                aria-label={t("settings.listenTo", { name: t(`names.${id}`) })}
                className="bg-staff-fill text-ink inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-semibold"
                data-testid={`sound-listen-${name}-${id}`}
              >
                <Play aria-hidden="true" className="size-4 shrink-0" />
                {t("settings.listen")}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

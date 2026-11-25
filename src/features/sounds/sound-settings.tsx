"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import { button, input } from "@/features/admin-ui/styles";
import { play, SOUND_IDS, SOUNDS, unlockedContext, type SoundId } from "@/lib/sounds/library";
import { saveStaffSounds } from "./actions";

export type StaffSounds = { orderSound: SoundId; callSound: SoundId };

// «Sounds» on the owner's home: a picker of the built-in sounds for the
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
      className="flex flex-col gap-5"
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
  // One picker and one Listen button per sound, instead of a list of 22 rows.
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid={`sound-picker-${name}`}>
      <label htmlFor={`${uid}-select`} className="text-[1.0625rem] font-semibold">
        {label}
      </label>
      <p id={`${uid}-hint`} className="text-staff-label2 m-0 text-[0.9375rem]">
        {hint}
      </p>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <select
          id={`${uid}-select`}
          value={value}
          onChange={(e) => onChange(e.target.value as SoundId)}
          aria-describedby={`${uid}-hint`}
          className={clsx(input, "min-w-0 flex-1 sm:max-w-sm")}
          data-testid={`sound-${name}`}
        >
          {SOUND_IDS.map((id) => (
            <option key={id} value={id}>
              {SOUNDS[id].loud ? t("settings.loudName", { name: t(`names.${id}`) }) : t(`names.${id}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onListen(value)}
          aria-label={t("settings.listenTo", { name: t(`names.${value}`) })}
          className={button("tinted", "shrink-0 px-4")}
          data-testid={`sound-listen-${name}`}
        >
          <Play aria-hidden="true" />
          {t("settings.listen")}
        </button>
      </div>
    </div>
  );
}

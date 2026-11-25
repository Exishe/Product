"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { play, unlockedContext, type SoundId } from "@/lib/sounds/library";
import { closeAlert, stepAlerts, type AlertRequest, type AlertState } from "./call-alerts";

const TICK_MS = 2_000; // repeats are due every 20 s; this is how often we look
const VIBRATION = [200, 100, 200];

type Texts = (request: AlertRequest) => { title: string; body: string };

// The waiter screen's alerts for guest calls and bill requests (ADR-088): a
// sound (after one tap), a vibration, the banners' state and, when the page is
// in the background, a system notification. The rules are in call-alerts.ts.
export function useCallAlerts({
  requests,
  callSound,
  texts,
}: {
  requests: readonly AlertRequest[];
  callSound: SoundId;
  texts: Texts;
}) {
  const [soundOn, setSoundOn] = useState(false);
  const [state, setState] = useState<AlertState>({});
  const [played, setPlayed] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const stateRef = useRef<AlertState>({});
  const live = useRef({ requests, callSound, texts, soundOn });
  useEffect(() => {
    live.current = { requests, callSound, texts, soundOn };
  });

  const look = useCallback(() => {
    const { requests: open, callSound: sound, texts: text, soundOn: on } = live.current;
    const step = stepAlerts(stateRef.current, open, Date.now(), on);
    // Re-render only when something the banners show has changed.
    const same =
      Object.keys(step.state).length === Object.keys(stateRef.current).length &&
      Object.entries(step.state).every(([id, t]) => stateRef.current[id]?.closed === t.closed);
    stateRef.current = step.state;
    if (!same) setState(step.state);
    if (step.fresh.length > 0) {
      if (typeof navigator.vibrate === "function") navigator.vibrate(VIBRATION);
      if (document.hidden) for (const r of step.fresh) void systemNotification(r, text(r));
    }
    if (step.play && on) {
      if (audio.current) play(audio.current, sound, { volume: step.play.volume });
      setPlayed((n) => n + 1);
    }
  }, []);

  // Right after the rows change, and on a timer for the repeats.
  useEffect(() => {
    look();
  }, [requests, soundOn, look]);
  useEffect(() => {
    const id = window.setInterval(look, TICK_MS);
    return () => window.clearInterval(id);
  }, [look]);

  // The tap that unlocks sound. It rings once so the waiter hears the volume,
  // and asks (once) to show notifications while the page is in the background.
  const enableSound = useCallback(() => {
    audio.current = unlockedContext(audio.current);
    if (audio.current) play(audio.current, live.current.callSound, { volume: 0.7 });
    setSoundOn(true);
    try {
      if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    } catch {
      // not available here
    }
  }, []);

  const close = useCallback((id: string) => {
    stateRef.current = closeAlert(stateRef.current, id);
    setState(stateRef.current);
  }, []);

  return { soundOn, enableSound, state, played, close };
}

// A system notification for a page in the background, through the service
// worker. Not when this device gets the same call as a web push (ADR-049):
// the tag is the push's own, so even a race replaces rather than doubles it.
async function systemNotification(request: AlertRequest, text: { title: string; body: string }) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return;
    if (await registration.pushManager?.getSubscription()) return;
    await registration.showNotification(text.title, {
      body: text.body,
      tag: `table:${request.tableId}:service.${request.kind === "call" ? "call" : "bill"}`,
      renotify: true,
      icon: "/icon.svg",
      data: { url: "/waiter" },
    } as NotificationOptions);
  } catch {
    // The banner and the sound still work.
  }
}

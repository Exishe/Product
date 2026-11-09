"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { Database } from "@/lib/supabase/database";

export type ChannelState = "connecting" | "live" | "down";

const DEBOUNCE_MS = 300;
const POLL_MS = 10_000;

// The guest's private Realtime channel guest:<guest_session_id> (realtime.md).
// Messages are hints: any message, a (re)subscription, the phone waking up and
// a 10-second safety poll all just call `refresh`, debounced so a burst of
// changes becomes one fetch.
export function useGuestChannel({
  supabase,
  guestSessionId,
  refresh,
  poll,
}: {
  supabase: SupabaseClient<Database> | null;
  guestSessionId: string | null;
  refresh: () => void;
  poll: boolean;
}): ChannelState {
  const [state, setState] = useState<ChannelState>("connecting");
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !guestSessionId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), DEBOUNCE_MS);
    };
    let closed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (closed) return;
      // Private channels are authorized with the user's token (RLS on realtime.messages).
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (closed) return;
      channel = supabase
        .channel(`guest:${guestSessionId}`, { config: { private: true } })
        .on("broadcast", { event: "*" }, soon)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setState("live");
            soon(); // catch up on anything missed while joining
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setState("down");
          }
        });
    })();

    const wake = () => {
      if (document.visibilityState === "visible") soon();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", soon);
    return () => {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", soon);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, guestSessionId]);

  useEffect(() => {
    if (!poll) return;
    const t = setInterval(() => latest.current(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  return state;
}

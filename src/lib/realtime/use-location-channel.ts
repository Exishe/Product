"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

export type ChannelStatus = "connecting" | "subscribed" | "down";

export type LocationEvent = "order" | "ticket" | "service_request" | "table" | "location";
export type LocationMessage = { event: LocationEvent; payload: Record<string, unknown> };

// Staff screens listen to the private Broadcast channel loc:<location_id>
// (realtime.md). Messages are hints that something changed, never the data:
// the caller refetches. Realtime Authorization (RLS on realtime.messages)
// decides who may join, so the channel needs the session's own token first.
// After a drop the client rejoins by itself; the caller refetches everything
// on every "subscribed". The client is created in the effect, never while
// rendering on the server.
export function useLocationChannel(
  getClient: () => SupabaseClient,
  locationId: string,
  onMessage: (message: LocationMessage) => void,
): ChannelStatus {
  const [status, setStatus] = useState<ChannelStatus>("connecting");
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const supabase = getClient();
    async function join() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase.channel(`loc:${locationId}`, { config: { private: true } });
      channel.on("broadcast", { event: "*" }, (message) => {
        handler.current({ event: message.event as LocationEvent, payload: (message.payload ?? {}) as Record<string, unknown> });
      });
      channel.subscribe((state) => {
        if (cancelled) return;
        if (state === "SUBSCRIBED") setStatus("subscribed");
        else setStatus("down"); // CHANNEL_ERROR, TIMED_OUT, CLOSED: realtime-js rejoins with backoff
      });
    }

    void join();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [getClient, locationId]);

  return status;
}

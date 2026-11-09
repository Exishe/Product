"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-reads the page every few seconds while a reading is still running.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

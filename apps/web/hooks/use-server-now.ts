"use client";

import { useEffect, useState } from "react";

/** Advance server time without extending deadlines when the device clock moves back. */
export function useServerNow(serverTime: string): number {
  const [clock, setClock] = useState(() => ({ serverTime, now: Math.max(Date.parse(serverTime), Date.now()) }));
  useEffect(() => {
    const base = Math.max(Date.parse(serverTime), Date.now());
    const started = performance.now();
    const update = () => setClock({ serverTime, now: Math.max(base + performance.now() - started, Date.now()) });
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 1_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [serverTime]);
  return clock.serverTime === serverTime ? clock.now : Date.parse(serverTime);
}

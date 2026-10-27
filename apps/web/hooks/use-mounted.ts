"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and hydration, true afterwards. Used for anything that depends on the user's clock or zone. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

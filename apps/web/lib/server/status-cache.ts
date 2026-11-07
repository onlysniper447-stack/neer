import type { Lookup } from "@neer/core";

/** Bounded per-instance cache. Address case is significant outside EVM networks. */
export class StatusCache {
  private readonly entries = new Map<string, { at: number; value: Promise<Lookup> }>();
  constructor(private readonly ttlMs = 5_000, private readonly maxEntries = 5_000) {}

  get(address: string, memo: string | null | undefined, load: () => Promise<Lookup>, now = Date.now()): Promise<Lookup> {
    for (const [key, entry] of this.entries) {
      if (now - entry.at < this.ttlMs) break;
      this.entries.delete(key);
    }
    const key = JSON.stringify([address, memo ?? null]);
    const hit = this.entries.get(key);
    if (hit) return hit.value;
    while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    const value = load();
    this.entries.set(key, { at: now, value });
    return value;
  }
}

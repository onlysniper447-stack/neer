/**
 * Deterministic JSON with sorted keys, matching `json-stable-stringify` for
 * plain JSON data: object keys sorted by code unit, `undefined` (and function)
 * properties omitted, `undefined` array items written as `null`.
 * Byte parity with the library is covered by tests.
 */
export function stableStringify(value: unknown): string {
  const out = write(value);
  return out === undefined ? "" : out;
}

function write(value: unknown): string | undefined {
  if (value === null) return "null";
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return write((value as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => write(v) ?? "null").join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const v = write(obj[key]);
      if (v !== undefined) parts.push(`${JSON.stringify(key)}:${v}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

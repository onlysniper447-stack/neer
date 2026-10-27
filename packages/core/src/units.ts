/** Decimal <-> base-unit conversion with BigInt only. No floats anywhere. */

export class AmountError extends Error {}

/** Parses a user-typed decimal ("0.17", "1,000.5") into base units. Rejects extra precision. */
export function parseAmount(input: string, decimals: number): bigint {
  const s = input.trim().replace(/[,_\s]/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") {
    throw new AmountError("Enter an amount like 0.17");
  }
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > decimals) {
    throw new AmountError(`This token has at most ${decimals} decimal places`);
  }
  const units = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  return units;
}

/** Formats base units as a trimmed decimal string, e.g. 170000000000000000n, 18 -> "0.17". */
export function formatAmount(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = decimals === 0 ? s : s.slice(0, -decimals);
  const frac = decimals === 0 ? "" : s.slice(-decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** Parses a decimal string such as "390.8385" into micro-units (1e-6) for exact comparisons. */
export function parseUsdMicros(input: string): bigint | undefined {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole + frac.slice(0, 6).padEnd(6, "0"));
}

export function formatUsd(micros: bigint): string {
  const cents = (micros + 5_000n) / 10_000n;
  const whole = cents / 100n;
  const c = (cents % 100n).toString().padStart(2, "0");
  return `$${whole.toLocaleString("en-US")}.${c}`;
}

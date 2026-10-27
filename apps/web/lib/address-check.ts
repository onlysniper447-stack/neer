import { getChain, listChains, looksAlike, sameAddress, validateAddress, type AddressFamily, type AddressValidation } from "@neer/core";
import { PastedAddressSchema } from "./inputs";

type Family = Exclude<AddressFamily, "unsupported">;

/** One representative 1Click chain per address family; validation only depends on the family. */
const SAMPLE_CHAIN: Record<Family, string> = { evm: "eth", solana: "sol", tron: "tron", stellar: "stellar", xrp: "xrp", ton: "ton", btc: "btc", near: "near" };

const FAMILY_LABEL: Record<Family, string> = {
  evm: "EVM",
  solana: "Solana",
  tron: "Tron",
  stellar: "Stellar",
  xrp: "XRP Ledger",
  ton: "TON",
  btc: "Bitcoin",
  near: "NEAR",
};

export type ChecksumState = "ok" | "none" | "bad";

export interface FamilyMatch {
  family: Family;
  label: string;
  /** Networks that share this address format. */
  networks: string[];
  validation: AddressValidation;
  checksum: { state: ChecksumState; text: string };
  /** Chain id used for comparisons. */
  chain: string;
}

export type AddressAnalysis =
  | { kind: "input-error"; message: string }
  | { kind: "valid"; input: string; matches: FamilyMatch[] }
  | { kind: "invalid"; input: string; reasons: { label: string; reason: string }[]; chosen: string | null };

export type Comparison =
  | { kind: "same"; caseOnly: boolean }
  | { kind: "lookalike" }
  | { kind: "different" };

function networksFor(family: Family): string[] {
  return listChains()
    .filter((c) => c.family === family)
    .map((c) => c.name);
}

function checksumFor(family: Family, raw: string, v: AddressValidation): FamilyMatch["checksum"] {
  switch (family) {
    case "evm":
      return v.noChecksum
        ? { state: "none", text: "All one letter case, so it carries no checksum and a typo can't be caught. Use the checksummed form below." }
        : { state: "ok", text: "EIP-55 checksum matches (the mix of upper and lower case is right)." };
    case "solana":
      return { state: "none", text: "Solana addresses have no checksum. It decodes to a valid 32-byte key, but a typo can still produce one." };
    case "tron":
      return { state: "ok", text: "Base58Check checksum matches." };
    case "stellar":
      return { state: "ok", text: "CRC-16 checksum matches." };
    case "xrp":
      return { state: "ok", text: v.reason ? `Checksum matches. This is an ${v.reason}.` : "Checksum matches." };
    case "ton":
      return raw.includes(":") ? { state: "none", text: "Raw TON form has no checksum." } : { state: "ok", text: "CRC-16 checksum matches." };
    case "btc":
      return raw.toLowerCase().startsWith("bc1") ? { state: "ok", text: "Bech32 checksum matches." } : { state: "ok", text: "Base58Check checksum matches." };
    case "near":
      return { state: "none", text: "NEAR account IDs have no checksum." };
  }
}

/** Families whose prefix makes them a plausible intent, for explaining a failure. */
function plausible(raw: string): Family[] {
  const out: Family[] = [];
  if (/^0x/i.test(raw)) out.push("evm");
  if (/^T/.test(raw)) out.push("tron");
  if (/^[GM]/.test(raw)) out.push("stellar");
  if (/^[rX]/.test(raw)) out.push("xrp");
  if (/^(1|3|bc1)/i.test(raw)) out.push("btc");
  if (/^[EU]Q/.test(raw) || /^-?\d+:/.test(raw)) out.push("ton");
  if (/\.(near|tg)$/.test(raw)) out.push("near");
  if (out.length === 0 && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) out.push("solana");
  return out;
}

export function analyzeAddress(input: string, chain: string | null): AddressAnalysis {
  const parsed = PastedAddressSchema.safeParse(input);
  if (!parsed.success) return { kind: "input-error", message: parsed.error.issues[0]?.message ?? "Paste the full address" };
  const raw = parsed.data;
  const families: Family[] = chain ? [getChain(chain).family as Family] : (Object.keys(SAMPLE_CHAIN) as Family[]);
  const results = families.map((f) => {
    const c = chain ?? SAMPLE_CHAIN[f];
    return { family: f, chain: c, v: validateAddress(c, raw) };
  });
  const matches: FamilyMatch[] = results
    .filter((r) => r.v.status === "valid")
    .map((r) => ({
      family: r.family,
      label: FAMILY_LABEL[r.family],
      networks: chain ? [getChain(chain).name] : networksFor(r.family),
      validation: r.v,
      checksum: checksumFor(r.family, raw, r.v),
      chain: r.chain,
    }));
  if (matches.length > 0) return { kind: "valid", input: raw, matches };
  const explain = chain ? results : results.filter((r) => plausible(raw).includes(r.family));
  return {
    kind: "invalid",
    input: raw,
    chosen: chain ? getChain(chain).name : null,
    reasons: explain.map((r) => ({ label: chain ? getChain(chain).name : FAMILY_LABEL[r.family], reason: r.v.reason ?? "not a valid address" })),
  };
}

export function compareAddresses(chain: string, a: string, b: string): Comparison {
  if (sameAddress(chain, a, b)) return { kind: "same", caseOnly: a !== b };
  if (looksAlike(chain, a, b)) return { kind: "lookalike" };
  return { kind: "different" };
}

/** Per-character difference mask between two strings (case-insensitive for EVM). */
export function diffMask(a: string, b: string, caseInsensitive: boolean): boolean[] {
  const x = caseInsensitive ? a.toLowerCase() : a;
  const y = caseInsensitive ? b.toLowerCase() : b;
  return Array.from(y, (ch, i) => x[i] !== ch);
}

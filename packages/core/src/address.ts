import { base32, base58, base58xrp, base64, base64urlnopad, bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { getAddress, isAddress } from "viem";
import { getChain, type AddressFamily } from "./chains.js";

export type AddressStatus = "valid" | "invalid" | "unsupported";

export interface AddressValidation {
  status: AddressStatus;
  family: AddressFamily;
  /** Canonical form used for equality: EIP-55 for EVM, raw `wc:hex` for TON, input otherwise. */
  normalized?: string;
  /** EVM only: true when the input was all one case, so it carried no checksum. */
  noChecksum?: boolean;
  reason?: string;
}

const base58check = createBase58check(sha256);

function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** CRC16-XModem, used by Stellar StrKey and TON user-friendly addresses. */
export function crc16xmodem(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function tryDecode(fn: () => Uint8Array): Uint8Array | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function validateEvm(raw: string): AddressValidation {
  if (!isAddress(raw, { strict: false })) {
    return { status: "invalid", family: "evm", reason: "not a 0x address with 40 hex characters" };
  }
  const body = raw.slice(2);
  const oneCase = body === body.toLowerCase() || body === body.toUpperCase();
  if (!oneCase && !isAddress(raw, { strict: true })) {
    return { status: "invalid", family: "evm", reason: "checksum does not match (one or more letters have the wrong case)" };
  }
  return { status: "valid", family: "evm", normalized: getAddress(raw), noChecksum: oneCase };
}

function validateSolana(raw: string): AddressValidation {
  const bytes = tryDecode(() => base58.decode(raw));
  if (!bytes || bytes.length !== 32) {
    return { status: "invalid", family: "solana", reason: "not a base58 32-byte Solana address" };
  }
  return { status: "valid", family: "solana", normalized: raw };
}

function validateTron(raw: string): AddressValidation {
  if (!raw.startsWith("T")) return { status: "invalid", family: "tron", reason: "Tron addresses start with T" };
  const payload = tryDecode(() => base58check.decode(raw));
  if (!payload || payload.length !== 21 || payload[0] !== 0x41) {
    return { status: "invalid", family: "tron", reason: "not a valid base58check Tron address" };
  }
  return { status: "valid", family: "tron", normalized: raw };
}

const STELLAR_VERSION_G = 6 << 3; // ed25519 public key
const STELLAR_VERSION_M = 12 << 3; // muxed account

function validateStellar(raw: string): AddressValidation {
  const bytes = tryDecode(() => base32.decode(padBase32(raw)));
  const fail: AddressValidation = { status: "invalid", family: "stellar", reason: "not a valid Stellar G… or M… address" };
  if (!bytes || bytes.length < 3) return fail;
  const version = bytes[0];
  const expectedLen = version === STELLAR_VERSION_G ? 35 : version === STELLAR_VERSION_M ? 43 : -1;
  if (bytes.length !== expectedLen) return fail;
  const body = bytes.slice(0, bytes.length - 2);
  const crc = crc16xmodem(body);
  const lo = bytes[bytes.length - 2];
  const hi = bytes[bytes.length - 1];
  if (lo !== (crc & 0xff) || hi !== (crc >> 8)) return fail;
  return { status: "valid", family: "stellar", normalized: raw };
}

function padBase32(s: string): string {
  const rem = s.length % 8;
  return rem === 0 ? s : s + "=".repeat(8 - rem);
}

/** Classic XRP address: base58 (ripple alphabet), version 0x00, double-SHA256 checksum. */
function validateXrpClassic(raw: string): boolean {
  if (!raw.startsWith("r")) return false;
  const bytes = tryDecode(() => base58xrp.decode(raw));
  if (!bytes || bytes.length !== 25 || bytes[0] !== 0x00) return false;
  const body = bytes.slice(0, 21);
  return bytesEqual(sha256d(body).slice(0, 4), bytes.slice(21));
}

export function isXrpXAddress(raw: string): boolean {
  if (!/^X[1-9A-HJ-NP-Za-km-z]{46}$/.test(raw)) return false;
  const bytes = tryDecode(() => base58xrp.decode(raw));
  return !!bytes && bytes.length === 35 && bytesEqual(sha256d(bytes.slice(0, 31)).slice(0, 4), bytes.slice(31));
}

/** Detects the classic-address-plus-destination-tag forms that 1Click does not support. */
export function xrpDestinationTag(raw: string): string | undefined {
  const m = /^(r[1-9A-HJ-NP-Za-km-z]{24,34})(?:\?dt=|:|\s+|#|\/)(\d{1,10})$/.exec(raw.trim());
  return m ? m[2] : undefined;
}

function validateXrp(raw: string): AddressValidation {
  if (validateXrpClassic(raw)) return { status: "valid", family: "xrp", normalized: raw };
  if (isXrpXAddress(raw)) {
    return { status: "valid", family: "xrp", normalized: raw, reason: "X-address (encodes a destination tag)" };
  }
  return { status: "invalid", family: "xrp", reason: "not a valid classic XRP address (r…)" };
}

function validateTon(raw: string): AddressValidation {
  const rawForm = /^(-?\d+):([0-9a-fA-F]{64})$/.exec(raw);
  if (rawForm) {
    return { status: "valid", family: "ton", normalized: `${rawForm[1]}:${rawForm[2]!.toLowerCase()}` };
  }
  const fail: AddressValidation = { status: "invalid", family: "ton", reason: "not a valid TON address" };
  if (raw.length !== 48) return fail;
  const bytes = /[-_]/.test(raw)
    ? tryDecode(() => base64urlnopad.decode(raw))
    : tryDecode(() => base64.decode(raw));
  if (!bytes || bytes.length !== 36) return fail;
  const crc = crc16xmodem(bytes.slice(0, 34));
  if (bytes[34] !== crc >> 8 || bytes[35] !== (crc & 0xff)) return fail;
  const flags = bytes[0]! & 0x7f; // strip test-only bit
  if (flags !== 0x11 && flags !== 0x51) return fail;
  const wc = bytes[1] === 0xff ? -1 : bytes[1]!;
  const hash = Array.from(bytes.slice(2, 34), (b) => b.toString(16).padStart(2, "0")).join("");
  return { status: "valid", family: "ton", normalized: `${wc}:${hash}` };
}

function validateBtc(raw: string): AddressValidation {
  const lower = raw.toLowerCase();
  if (lower.startsWith("bc1")) {
    if (raw !== lower && raw !== raw.toUpperCase()) {
      return { status: "invalid", family: "btc", reason: "mixed-case bech32" };
    }
    for (const codec of [bech32, bech32m]) {
      const dec = tryDecode(() => {
        const d = codec.decode(lower as `${string}1${string}`, 90);
        return Uint8Array.from(d.words);
      });
      if (dec && dec.length > 0) {
        const version = dec[0]!;
        // v0 must be bech32, v1+ must be bech32m (BIP-350)
        if ((version === 0) === (codec === bech32)) {
          return { status: "valid", family: "btc", normalized: lower };
        }
      }
    }
    return { status: "invalid", family: "btc", reason: "not a valid bech32 Bitcoin address" };
  }
  const payload = tryDecode(() => base58check.decode(raw));
  if (payload && payload.length === 21 && (payload[0] === 0x00 || payload[0] === 0x05)) {
    return { status: "valid", family: "btc", normalized: raw };
  }
  return { status: "invalid", family: "btc", reason: "not a valid Bitcoin address" };
}

const NEAR_NAMED = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

function validateNear(raw: string): AddressValidation {
  if (/^[0-9a-f]{64}$/.test(raw) || /^0x[0-9a-f]{40}$/.test(raw) || NEAR_NAMED.test(raw)) {
    return { status: "valid", family: "near", normalized: raw };
  }
  return { status: "invalid", family: "near", reason: "not a valid NEAR account ID" };
}

export function validateAddress(chainId: string, raw: string): AddressValidation {
  const family = getChain(chainId).family;
  switch (family) {
    case "evm":
      return validateEvm(raw);
    case "solana":
      return validateSolana(raw);
    case "tron":
      return validateTron(raw);
    case "stellar":
      return validateStellar(raw);
    case "xrp":
      return validateXrp(raw);
    case "ton":
      return validateTon(raw);
    case "btc":
      return validateBtc(raw);
    case "near":
      return validateNear(raw);
    case "unsupported":
      return { status: "unsupported", family };
  }
}

/**
 * Canonical comparison key. EVM compares case-insensitively (EIP-55 only
 * changes case), TON compares by raw account, everything else byte for byte.
 */
export function addressKey(chainId: string, raw: string): string {
  const v = validateAddress(chainId, raw);
  if (v.status === "valid" && v.normalized) {
    return v.family === "evm" ? v.normalized.toLowerCase() : v.normalized;
  }
  return getChain(chainId).family === "evm" ? raw.toLowerCase() : raw;
}

export function sameAddress(chainId: string, a: string, b: string): boolean {
  return addressKey(chainId, a) === addressKey(chainId, b);
}

/** Same first 4 and last 4 characters (after any 0x prefix) but not the same address. */
export function looksAlike(chainId: string, a: string, b: string): boolean {
  if (sameAddress(chainId, a, b)) return false;
  const strip = (s: string) => (s.toLowerCase().startsWith("0x") ? s.slice(2) : s);
  const evm = getChain(chainId).family === "evm";
  const x = evm ? strip(a).toLowerCase() : strip(a);
  const y = evm ? strip(b).toLowerCase() : strip(b);
  return x.length >= 8 && y.length >= 8 && x.slice(0, 4) === y.slice(0, 4) && x.slice(-4) === y.slice(-4);
}

/** Middle-elided display form, e.g. 0x2527…f10D. */
export function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  const head = addr.startsWith("0x") ? 6 : 4;
  return `${addr.slice(0, head)}…${addr.slice(-4)}`;
}

import { z } from "zod";

/**
 * RHEA Cross-Chain Swap API chains, from the "Supported chains and tokens" table in
 * https://github.com/rhea-finance/rhea-sdk-docs/blob/main/CrossChainDexAPI.md (commit fa77fe1).
 * `id` is the HTTP API chain ID used in quotes; `listId` is the token-list chain ID;
 * `alias` is the documented `blockchain` alias, matched against NEAR Intents blockchain IDs.
 */
export const RHEA_CHAINS = [
  { id: "1", listId: 1, name: "Ethereum", alias: "eth" },
  { id: "10", listId: 10, name: "Optimism", alias: "op" },
  { id: "43114", listId: 43114, name: "Avalanche", alias: "avax" },
  { id: "4663", listId: 4663, name: "Robinhood Chain", alias: "robinhood" },
  { id: "747474", listId: 747474, name: "Katana", alias: "katana" },
  { id: "146", listId: 146, name: "Sonic", alias: "sonic" },
  { id: "130", listId: 130, name: "Unichain", alias: "unichain" },
  { id: "1672", listId: 1672, name: "Pharos", alias: "pharos" },
  { id: "4217", listId: 4217, name: "Tempo", alias: "tempo" },
  { id: "5042", listId: 5042, name: "Arc", alias: "arc" },
  { id: "56", listId: 56, name: "BNB Smart Chain", alias: "bsc" },
  { id: "100", listId: 100, name: "Gnosis Chain", alias: "gnosis" },
  { id: "137", listId: 137, name: "Polygon PoS", alias: "pol" },
  { id: "143", listId: 143, name: "Monad", alias: "monad" },
  { id: "196", listId: 196, name: "X Layer", alias: "xlayer" },
  { id: "8453", listId: 8453, name: "Base", alias: "base" },
  { id: "9745", listId: 9745, name: "Plasma", alias: "plasma" },
  { id: "999", listId: 999, name: "HyperEVM", alias: "hypercore" },
  { id: "42161", listId: 42161, name: "Arbitrum One", alias: "arb" },
  { id: "80094", listId: 80094, name: "Berachain", alias: "bera" },
  { id: "tron", listId: 195, name: "Tron", alias: "tron" },
  { id: "solana", listId: 501, name: "Solana", alias: "sol" },
  { id: "sui", listId: 784, name: "Sui", alias: "sui" },
  { id: "near", listId: 900001, name: "NEAR", alias: "near" },
  { id: "btc", listId: 900002, name: "Bitcoin", alias: "btc" },
  { id: "zcash", listId: 900010, name: "Zcash", alias: "zec" },
  { id: "aptos", listId: 900012, name: "Aptos", alias: "aptos" },
] as const;

export type RheaChainId = (typeof RHEA_CHAINS)[number]["id"];
const CHAIN_IDS = RHEA_CHAINS.map((c) => c.id) as [RheaChainId, ...RheaChainId[]];
export const RheaChainIdSchema = z.enum(CHAIN_IDS);

export function rheaChain(id: string) {
  return RHEA_CHAINS.find((c) => c.id === id);
}

/** Routers whose RHEA build is a NEAR Intents deposit, which is what Neer can check. */
export const NEAR_INTENTS_ROUTERS = new Set(["nearintents", "preswap-nearintents"]);

export const RHEA_TRADE_URL = "https://x.rhea.finance/en/trade";

/** Token as Neer returns it to the browser. No logos, prices or other remote assets. */
export interface RheaToken {
  chain: RheaChainId;
  address: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
  /** NEAR Intents asset ID when RHEA provides one, e.g. `nep141:wrap.near`. */
  assetId: string | null;
}

export type RheaTokenDirection = "from" | "to";

const printable = (max: number) => z.string().trim().min(1).max(max).regex(/^[\x21-\x7e]+$/, "Use printable characters without spaces");

/** A human-readable decimal amount, e.g. `1.5`. No exponent, sign or commas. */
export const HumanAmountSchema = z.string().trim().min(1).max(64).regex(/^\d+(\.\d+)?$/, "Enter an amount such as 1.5");

export const RheaQuoteInputSchema = z.object({
  fromChain: RheaChainIdSchema,
  toChain: RheaChainIdSchema,
  tokenIn: printable(256),
  tokenOut: printable(256),
  amount: HumanAmountSchema,
  slippageBps: z.number().int().min(1).max(500).default(50),
  sender: z.string().trim().max(128).optional(),
  recipient: z.string().trim().max(128).optional(),
}).strict();
export type RheaQuoteInput = z.input<typeof RheaQuoteInputSchema>;

export const ADDRESS_PATTERN = /^[A-Za-z0-9:_\-.]{2,128}$/;

/** Exact base-unit conversion with BigInt. Returns null when `amount` has more decimals than the token. */
export function toBaseUnits(amount: string, decimals: number): string | null {
  const [whole = "0", frac = ""] = amount.split(".");
  if (frac.length > decimals) return null;
  const digits = (whole + frac.padEnd(decimals, "0")).replace(/^0+(?=\d)/, "");
  return BigInt(digits).toString();
}

export function fromBaseUnits(base: string, decimals: number): string {
  const value = BigInt(base);
  if (decimals === 0) return value.toString();
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Prefill for Neer's existing /check deep link. The deposit address is always left blank. */
export interface CheckPrefill {
  network: string;
  token: string;
  amount: string;
}

export interface RheaQuoteView {
  router: string;
  viaNearIntents: boolean;
  fromChain: RheaChainId;
  toChain: RheaChainId;
  tokenIn: Pick<RheaToken, "symbol" | "decimals" | "address">;
  tokenOut: Pick<RheaToken, "symbol" | "decimals" | "address">;
  amountIn: string;
  estimatedOut: string;
  minAmountOut: string;
  alternatives: number;
  receivedAt: string;
  check: CheckPrefill | null;
  checkNote: string | null;
}

export function checkHref(prefill: CheckPrefill): string {
  return `/check?${new URLSearchParams({ network: prefill.network, token: prefill.token, amount: prefill.amount }).toString()}`;
}

export interface RheaApiError {
  code:
    | "RHEA_NOT_CONFIGURED"
    | "RHEA_INVALID_INPUT"
    | "RHEA_SENDER_REQUIRED"
    | "RHEA_TOKEN_UNKNOWN"
    | "RHEA_RATE_LIMITED"
    | "RHEA_UPSTREAM_RATE_LIMITED"
    | "RHEA_UNAUTHORIZED"
    | "RHEA_TIMEOUT"
    | "RHEA_BAD_RESPONSE"
    | "RHEA_NO_ROUTE"
    | "RHEA_UNAVAILABLE"
    | "RHEA_FORBIDDEN_ORIGIN";
  message: string;
}

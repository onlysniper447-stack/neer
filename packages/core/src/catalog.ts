import type { CheckId } from "./types.js";

/** The most severe result a check can produce on its own. */
export type MaxSeverity = "block" | "warn" | "info";

export interface RuleInfo {
  id: Exclude<CheckId, "quote">;
  /** Same title as the check row in a result. */
  title: string;
  /** What the check looks at, in plain English. */
  what: string;
  /** When it says Don't send. Null if it never blocks. */
  blocksWhen: string | null;
  /** When it says Check this. Null if it never warns. */
  warnsWhen: string | null;
  maxSeverity: MaxSeverity;
}

/**
 * Human-readable catalog of the checks in RULES, for docs, the rules table and
 * the resources page. A unit test keeps ids and titles in sync with RULES.
 */
export const RULE_CATALOG: readonly RuleInfo[] = [
  {
    id: "signature",
    title: "Quote",
    what: "The quote for this address is signed by NEAR Intents, and nothing in it was changed after signing.",
    blocksWhen: "The signature is missing or doesn't verify.",
    warnsWhen: null,
    maxSeverity: "block",
  },
  {
    id: "used",
    title: "Address status",
    what: "The deposit address is still waiting for a deposit. Each address is for one swap only.",
    blocksWhen: "The address was already used, refunded or failed.",
    warnsWhen: null,
    maxSeverity: "block",
  },
  {
    id: "time",
    title: "Time left",
    what: "There is enough time left to send and confirm on the origin network before the quote expires.",
    blocksWhen: "The quote expired, or there's less time left than the network needs to confirm.",
    warnsWhen: "The deadline is close (under twice the network's confirm time, or 10 minutes).",
    maxSeverity: "block",
  },
  {
    id: "lookalike",
    title: "Address match",
    what: "The address you pasted, and the one on your send screen, are exactly the signed deposit address.",
    blocksWhen: "They differ, or only the first and last characters match (address poisoning).",
    warnsWhen: null,
    maxSeverity: "block",
  },
  {
    id: "network",
    title: "Network",
    what: "You send on the network the quote expects. Base and Ethereum share an address format, so the format alone can't tell.",
    blocksWhen: "The network you chose, or your wallet's chain ID, isn't the quote's network.",
    warnsWhen: null,
    maxSeverity: "block",
  },
  {
    id: "format",
    title: "Address format",
    what: "The deposit address is valid for the quote's network, including its checksum where it has one.",
    blocksWhen: "The address isn't valid for that network.",
    warnsWhen: "Not confirmed for networks Neer can't validate yet.",
    maxSeverity: "block",
  },
  {
    id: "token",
    title: "Token",
    what: "You send the exact token the quote expects, by contract, not just by name.",
    blocksWhen: "It's a different token, or an unknown contract on the right network.",
    warnsWhen: "Same symbol, different contract (for example a bridged USDC).",
    maxSeverity: "block",
  },
  {
    id: "memo",
    title: "Memo",
    what: "If the swap needs a memo, you add exactly that memo.",
    blocksWhen: "A required memo is missing or different.",
    warnsWhen: null,
    maxSeverity: "block",
  },
  {
    id: "amount",
    title: "Amount",
    what: "You send at least what the quote needs, using the quote's swap type.",
    blocksWhen: "You'd send less than the quote needs.",
    warnsWhen: "You'd send more (the extra goes back to the refund address), or the tokens differ so it can't compare.",
    maxSeverity: "block",
  },
  {
    id: "minimum",
    title: "Network minimum",
    what: "The swap is above the temporary minimums NEAR Intents enforces on some networks.",
    blocksWhen: "It's under $1,000 on BSC, Polygon, TON, Optimism, Avalanche, Stellar, Monad, X Layer or ADI, or under $100 from Tron.",
    warnsWhen: "Not confirmed once Neer's copy of the minimums is older than 14 days.",
    maxSeverity: "block",
  },
  {
    id: "xrp",
    title: "XRP tag",
    what: "XRP refund and recipient addresses don't rely on a destination tag, which 1Click doesn't support.",
    blocksWhen: "A refund or recipient address uses a destination tag.",
    warnsWhen: "An X-address is used (it encodes a tag).",
    maxSeverity: "block",
  },
  {
    id: "refund",
    title: "Refund to",
    what: "Refunds go to a valid address on the right network, ideally yours.",
    blocksWhen: "The refund address is invalid, or it's the deposit address itself.",
    warnsWhen: null,
    maxSeverity: "block",
  },
  {
    id: "approval",
    title: "Transfer type",
    what: "A draft transaction (API and widget only) is a plain transfer, not an approval or another contract call.",
    blocksWhen: "The draft is an approval or a different contract call.",
    warnsWhen: "The amount is at or under the refund fee.",
    maxSeverity: "block",
  },
  {
    id: "confidential",
    title: "Confidential swap",
    what: "Confidential swaps hide details Neer would need.",
    blocksWhen: null,
    warnsWhen: "The quote is a confidential swap, which Neer doesn't check.",
    maxSeverity: "warn",
  },
  {
    id: "exchange",
    title: "Sending from",
    what: "Where the money comes from. Exchanges add fees and can be slow to credit refunds.",
    blocksWhen: null,
    warnsWhen: "You send from an exchange, or didn't say.",
    maxSeverity: "warn",
  },
  {
    id: "stale",
    title: "Freshness",
    what: "The status and prices Neer used are recent.",
    blocksWhen: null,
    warnsWhen: "The status read is over 60 seconds old, or prices are over 15 minutes old.",
    maxSeverity: "warn",
  },
  {
    id: "incident",
    title: "Network incidents",
    what: "Known delays on NEAR Intents. This needs a partner key, so Neer says it isn't checked.",
    blocksWhen: null,
    warnsWhen: null,
    maxSeverity: "info",
  },
];

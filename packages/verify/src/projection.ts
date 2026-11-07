import { ACTIONABLE_FINDING_CODES, aggregateVerdict, checkCode, type PreflightResult } from "@neer/core";
import { VERIFY_VERSION, type Finding, type FindingCode, type VerifyResult } from "./types.js";

const fixes: Record<FindingCode, string> = {
  "QUOTE_PREVIEW": "Request a real non-preview quote.",
  "QUOTE_UNVERIFIED": "Do not send; request a fresh signed quote.",
  "PARTNER_QUOTE_MISMATCH": "Get a new quote.",
  "DEPOSIT_STATUS_UNKNOWN": "Recheck status before sending.",
  "DEPOSIT_IN_USE": "Track it; do not send again.",
  "DEPOSIT_INCOMPLETE": "Check refund status with the swap app; do not top up.",
  "DEPOSIT_ALREADY_USED": "Get a new quote.",
  "QUOTE_DEADLINE_MISSING": "Get a fresh quote.",
  "QUOTE_EXPIRED": "Get a new quote.",
  "QUOTE_TOO_CLOSE_TO_EXPIRY": "Get a fresh quote.",
  "QUOTE_NEAR_EXPIRY": "Get a fresh quote if sending could take longer.",
  "DEPOSIT_ADDRESS_INACTIVE": "Review slower-processing risk.",
  "QUOTE_DEPOSIT_ADDRESS_MISSING": "Obtain a real deposit quote/address.",
  "ADDRESS_LOOKALIKE": "Copy the address again.",
  "ADDRESS_MISMATCH": "Copy the address again.",
  "SEND_ADDRESS_INVALID": "Copy it again from the swap app.",
  "INTENTS_DEPOSIT_UNSUPPORTED": "Do not treat Neer as verifying this funding mode.",
  "CONFIDENTIAL_DEPOSIT_UNSUPPORTED": "Do not treat Neer as verifying this funding mode.",
  "ORIGIN_NETWORK_UNKNOWN": "Retry token metadata lookup.",
  "CHAIN_ID_UNKNOWN": "Review chain ID; do not infer a match.",
  "NETWORK_NOT_SELECTED": "Pick the wallet/exchange network.",
  "CHAIN_ID_CONFLICT": "Switch to expected network.",
  "NETWORK_MISMATCH": "Switch to expected network.",
  "FORMAT_NETWORK_UNKNOWN": "Retry metadata lookup.",
  "ADDRESS_FORMAT_UNSUPPORTED": "Independently review the format.",
  "DEPOSIT_ADDRESS_INVALID": "Copy the address again.",
  "ADDRESS_NO_CHECKSUM": "Review exact address comparison.",
  "ORIGIN_TOKEN_UNKNOWN": "Retry token metadata lookup.",
  "TOKEN_NOT_SELECTED": "Choose the token.",
  "TOKEN_UNACCEPTED_CONTRACT": "Change token.",
  "TOKEN_UNRECOGNISED": "Check token/network selection.",
  "TOKEN_SYMBOL_MISMATCH": "Change token.",
  "TOKEN_NETWORK_MISMATCH": "Change token to quote origin network.",
  "TOKEN_CONTRACT_MISMATCH": "Change token.",
  "QUOTE_MEMO_MISSING": "Do not send until the app shows the memo.",
  "MEMO_MISSING": "Add the memo.",
  "MEMO_MISMATCH": "Fix the memo.",
  "MEMO_EXCHANGE_WARNING": "Ensure exchange supports memo; otherwise do not send from it.",
  "SWAP_TYPE_UNSUPPORTED": "Use a supported personal-send quote.",
  "AMOUNT_MISSING": "Enter amount.",
  "AMOUNT_TOKEN_PRECISION_MISMATCH": "Resolve token mismatch before amount comparison.",
  "AMOUNT_BELOW_QUOTE": "Change amount.",
  "AMOUNT_ABOVE_QUOTE": "Reduce amount.",
  "MINIMUM_USD_UNKNOWN": "Review unknown network minimum.",
  "MINIMUM_NETWORK_UNKNOWN": "Retry metadata lookup.",
  "MINIMUM_RULES_STALE": "Recheck official published rules.",
  "MINIMUM_NETWORK_1000": "Increase amount or choose another network.",
  "MINIMUM_TRON_100": "Increase amount or choose another network.",
  "XRP_DESTINATION_TAG_UNSUPPORTED": "Use an owned XRP address without a tag.",
  "XRP_XADDRESS_WARNING": "Use a classic owned r\u2026 address.",
  "XRP_ADDRESS_INVALID": "Use a valid owned XRP address without a tag.",
  "REFUND_NETWORK_UNKNOWN": "Retry metadata lookup.",
  "REFUND_ADDRESS_INVALID": "Get a new quote.",
  "REFUND_TO_DEPOSIT_ADDRESS": "Get a new quote with a separate controlled refund address.",
  "REFUND_FORMAT_UNSUPPORTED": "Confirm control independently.",
  "REFUND_DIFFERS_FROM_SENDER": "Confirm control independently.",
  "DRAFT_NETWORK_UNSUPPORTED": "Do not use EVM decoding as proof on another network.",
  "DRAFT_APPROVAL": "Stop: this is not a deposit transfer.",
  "DRAFT_NOT_PLAIN_TRANSFER": "Use a plain transfer.",
  "AMOUNT_AT_OR_BELOW_REFUND_FEE": "Review refund-fee risk.",
  "CONFIDENTIAL_SWAP_UNSUPPORTED": "Do not treat Neer as checking confidential details.",
  "SOURCE_EXCHANGE": "Account for fees/delay; verify controlled refund address.",
  "SOURCE_UNKNOWN": "Say wallet or exchange.",
  "STATUS_STALE": "Run checks again.",
  "TOKEN_PRICE_STALE": "Treat USD value as approximate.",
  "RULE_EXECUTION_FAILED": "Recheck; never infer pass.",
  "REQUIRED_CHECK_MISSING": "Recheck; never infer pass.",
  "QUOTE_NOT_FOUND": "Copy again or obtain new quote.",
  "QUOTE_UNAVAILABLE": "Wait and retry before sending."
};
const actionable: ReadonlySet<string> = new Set(ACTIONABLE_FINDING_CODES);
const failed = "This check couldn't run, so we can't call this safe.";

/** Internal projection; identity comes from rule metadata, never message/headline matching. */
export function projectVerification(result: PreflightResult): VerifyResult {
  const findings: Finding[] = [];
  for (const check of result.checks) {
    if (check.severity === "pass" || check.severity === "info") continue;
    const rawCode = checkCode(check);
    const code: FindingCode = rawCode && actionable.has(rawCode) ? rawCode as FindingCode : "RULE_EXECUTION_FAILED";
    findings.push({
      code,
      severity: check.severity === "block" || code === "QUOTE_UNAVAILABLE" ? "block" : "warn",
      message: rawCode && actionable.has(rawCode) ? check.message : failed,
      fix: fixes[code],
    });
  }
  // A partial/contradictory internal result must never turn into an empty pass.
  if (findings.length === 0 && (result.verdict !== "safe" || aggregateVerdict(result.checks) !== "safe")) {
    findings.push({ code: "REQUIRED_CHECK_MISSING", severity: result.verdict === "block" ? "block" : "warn", message: "A required check didn't run, so we can't call this safe.", fix: fixes.REQUIRED_CHECK_MISSING });
  }
  const q = result.quote;
  return {
    status: findings.some((f) => f.severity === "block") ? "block" : findings.length ? "warn" : "pass",
    findings,
    quote: q?.verified ? {
      verified: true,
      network: q.originChain,
      token: q.originAsset,
      amount: q.originDecimals === null ? null : q.amountInFormatted,
      minimumAmount: q.minAmountInFormatted,
      expiresAt: q.sendBefore,
      swapType: q.swapType,
    } : null,
    checkedAt: result.serverTime,
    version: VERIFY_VERSION,
  };
}

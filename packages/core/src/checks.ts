import { looksAlike, sameAddress, shortAddress, validateAddress, xrpDestinationTag, isXrpXAddress } from "./address.js";
import { chainName, getChain } from "./chains.js";
import { resolveDeclaredToken, type Ctx } from "./context.js";
import type { CheckResult, Severity } from "./types.js";
import { formatAmount, formatUsd, parseUsdMicros } from "./units.js";

type Partial = Omit<CheckResult, "id" | "title">;
type Rule = (c: Ctx) => Partial | null;

const r = (severity: Severity, headline: string, summary: string, message: string, extra: Omit<Partial, "severity" | "headline" | "summary" | "message"> = {}): Partial => ({
  severity,
  headline,
  summary,
  message,
  ...extra,
});

export function sendBefore(c: Ctx): Date | null {
  const times = [c.qr.quoteRequest.deadline, c.qr.quote.deadline]
    .filter((x): x is string => !!x)
    .map((x) => new Date(x));
  if (times.length === 0) return null;
  return new Date(Math.min(...times.map((t) => t.getTime())));
}

export function humanDuration(sec: number): string {
  if (sec < 60) return "under a minute";
  const min = Math.floor(sec / 60);
  if (min < 120) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 48) return m ? `${h} hours ${m} min` : `${h} hours`;
  return `${Math.floor(h / 24)} days`;
}

function fmtOrigin(c: Ctx, units: bigint): string {
  return c.originToken ? `${formatAmount(units, c.originToken.decimals)} ${c.originToken.symbol}` : `${units.toString()} base units`;
}

// ---------------------------------------------------------------- signature

const signature: Rule = (c) => {
  if (c.qr.quoteRequest.dry) {
    return r("block", "Preview quote", "Dry run, no deposit address", "This is a preview quote with no deposit address. Don't send to it. Get a real quote from your app.");
  }
  if (!c.signatureOk) {
    return r("block", "Unconfirmed quote", "Signature failed", "We couldn't confirm this quote came from NEAR Intents. Don't send.");
  }
  if (c.partnerQuoteMismatch) {
    return r("block", "Quote mismatch", "Not the quote 1Click has", "The quote your app passed isn't the one NEAR Intents has for this address. Don't send. Get a new quote.");
  }
  return r("pass", "Quote confirmed", "Signed by 1Click", "Quote confirmed by NEAR Intents.");
};

// ---------------------------------------------------------------- used

const used: Rule = (c) => {
  if (!c.status) {
    return r("unknown", "Status unknown", "Couldn't read status", "We couldn't see whether this address is still waiting for a deposit. Check again before you send.");
  }
  const s = c.status.status;
  const actual = { status: s };
  switch (s) {
    case "PENDING_DEPOSIT":
      return r("pass", "Waiting for deposit", "Waiting for you", "This address is waiting for your deposit.", { actual });
    case "KNOWN_DEPOSIT_TX":
    case "PROCESSING":
      return r("block", "Already in use", s === "PROCESSING" ? "Swap in progress" : "Deposit already seen", "A deposit to this address is already on its way. Each deposit address works once. Don't send again; track it instead.", { actual, expected: { status: "PENDING_DEPOSIT" } });
    case "INCOMPLETE_DEPOSIT":
      return r("block", "Already used", "Less than needed arrived", "Someone already sent less than this swap needs to this address. It will be refunded after the deadline. Don't send more here; get a new quote.", { actual, expected: { status: "PENDING_DEPOSIT" } });
    case "SUCCESS":
    case "REFUNDED":
    case "FAILED":
      return r("block", "Address already used", s.charAt(0) + s.slice(1).toLowerCase(), "This address was already used. Each deposit address works once. Get a new quote.", { actual, expected: { status: "PENDING_DEPOSIT" }, action: { kind: "new-quote", label: "Get a new quote" } });
  }
};

// ---------------------------------------------------------------- time

const time: Rule = (c) => {
  const before = sendBefore(c);
  if (!before) return r("unknown", "No deadline", "No deadline in quote", "This quote has no deadline, so we can't tell how long it's valid. Get a fresh quote.");
  const left = Math.floor((before.getTime() - c.now.getTime()) / 1000);
  const expected = { sendBefore: before.toISOString() };
  const actual = { secondsLeft: left };
  if (left <= 0) {
    return r("block", "Quote expired", "Expired", "This quote has expired. Don't send to this address. Get a new quote from your app.", { expected, actual, action: { kind: "new-quote", label: "Get a new quote" } });
  }
  const chain = c.originChain ? getChain(c.originChain) : undefined;
  const budget = chain?.confirmBudgetSec ?? 10 * 60;
  if (left < budget) {
    return r("block", "Too close to expiry", `${humanDuration(left)} left`, `Too close. Only ${humanDuration(left)} left, and a send on ${chain?.name ?? "this network"} can take about ${humanDuration(budget)}. Get a fresh quote.`, { expected, actual, action: { kind: "new-quote", label: "Get a fresh quote" } });
  }
  if (left < Math.max(2 * budget, c.rules.nearExpiryWarnSec)) {
    return r("warn", "Close to expiry", `${humanDuration(left)} left`, `${capitalise(humanDuration(left))} left. If your send could take longer, get a fresh quote first.`, { expected, actual, action: { kind: "new-quote", label: "Get a fresh quote" } });
  }
  const inactive = c.qr.quote.timeWhenInactive ? new Date(c.qr.quote.timeWhenInactive) : null;
  if (inactive && inactive.getTime() <= c.now.getTime()) {
    return r("warn", "Address gone cold", "Slower processing", "This deposit address has gone quiet, so the swap may take longer than usual.", { expected, actual });
  }
  return r("pass", "Time left", `${humanDuration(left)} left`, `${capitalise(humanDuration(left))} left. Plenty of time.`, { expected, actual });
};

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- lookalike

const lookalike: Rule = (c) => {
  const quoteAddr = c.qr.quote.depositAddress;
  if (!quoteAddr) return r("unknown", "No address", "No deposit address", "This quote has no deposit address to compare with.");
  const chain = c.originChain ?? (c.qr.quoteRequest.depositType === "INTENTS" ? "near" : undefined);
  const cmpChain = chain ?? "unknown";
  const candidates: { label: string; addr: string }[] = [{ label: "pasted", addr: c.pasted }];
  if (c.to) candidates.push({ label: "send", addr: c.to });
  for (const cand of candidates) {
    if (!sameAddress(cmpChain, cand.addr, quoteAddr)) {
      const expected = { address: quoteAddr };
      const actual = { address: cand.addr };
      const fix = { kind: "edit-send" as const, label: "Copy the address again" };
      const where = cand.label === "send" ? "The address you're sending to" : "This";
      if (looksAlike(cmpChain, cand.addr, quoteAddr)) {
        return r("block", "Lookalike address", "Looks similar, isn't", `${where} isn't the quote's address. It looks similar, but the middle is different. Copy it again from your swap app.`, { expected, actual, action: fix });
      }
      return r("block", "Different address", "Not the quote's address", `${where} isn't the quote's address. Copy it again from your swap app.`, { expected, actual, action: fix });
    }
  }
  return r("pass", "Address matches", "Matches the quote", "Address matches the quote, character for character.", { expected: { address: quoteAddr } });
};

// ---------------------------------------------------------------- network

const network: Rule = (c) => {
  const dt = c.qr.quoteRequest.depositType;
  if (dt === "INTENTS") {
    return r("unknown", "Intents deposit", "Inside NEAR Intents", "This quote expects a transfer inside NEAR Intents, not a send on a network. Neer doesn't check those yet.");
  }
  if (dt === "CONFIDENTIAL_INTENTS") {
    return r("unknown", "Confidential deposit", "Confidential Intents", "This quote is funded from Confidential Intents. Neer doesn't check those yet.");
  }
  if (!c.originChain) {
    return r("unknown", "Network unknown", "Couldn't look up", "We couldn't look up which network this quote expects. Try again in a minute.");
  }
  const expectedName = chainName(c.originChain);
  const expected = { chain: c.originChain, chainId: getChain(c.originChain).evmChainId ?? null };
  if (c.unknownChainId !== undefined && !c.declaredChain) {
    return r("unknown", "Network unknown", `Chain ID ${c.unknownChainId}`, `We don't recognise chain ID ${c.unknownChainId}. This quote expects ${expectedName}.`, { expected, actual: { chainId: c.unknownChainId } });
  }
  if (!c.declaredChain) {
    return r("warn", "Pick your network", "Not chosen yet", "We can't see your network. Pick the one your wallet or exchange shows before you send.", { expected });
  }
  const actual = { chain: c.declaredChain, chainId: getChain(c.declaredChain).evmChainId ?? null };
  if (c.chainIdConflict) {
    const onName = chainName(c.chainIdConflict.chain);
    return r("block", "Network mismatch", `Chain ID ${c.chainIdConflict.chainId}`, `Your wallet is on chain ID ${c.chainIdConflict.chainId}, which isn't ${onName}. This address is for ${expectedName}.`, { expected, actual: { chainId: c.chainIdConflict.chainId }, action: { kind: "switch-network", chain: c.originChain, label: `Switch to ${expectedName}` } });
  }
  if (c.declaredChain !== c.originChain) {
    const youName = chainName(c.declaredChain);
    return r("block", "Wrong network", `${youName}, not ${expectedName}`, `Wrong network. This address is for ${expectedName}. You chose ${youName}. Funds sent on ${youName} won't be swapped automatically.`, { expected, actual, action: { kind: "switch-network", chain: c.originChain, label: `Switch to ${expectedName}` } });
  }
  return r("pass", "Right network", expectedName, `Right network. You're sending on ${expectedName}, which this quote expects.`, { expected, actual });
};

// ---------------------------------------------------------------- format

const format: Rule = (c) => {
  if (c.qr.quoteRequest.depositType !== "ORIGIN_CHAIN") return null;
  if (!c.originChain) return r("unknown", "Format unknown", "Network unknown", "We couldn't check the address format because we don't know the network.");
  const name = chainName(c.originChain);
  const v = validateAddress(c.originChain, c.pasted);
  if (v.status === "unsupported") {
    return r("unknown", "Format not checked", "Not checked", `We don't check ${name} address formats yet, so look at it carefully.`);
  }
  if (v.status === "invalid") {
    return r("block", "Not a valid address", `Not a ${name} address`, `This doesn't look like a ${name} address. Copy it again from your swap app.`, { actual: { reason: v.reason ?? null } });
  }
  if (v.noChecksum) {
    const signed = c.qr.quote.depositAddress ? validateAddress(c.originChain, c.qr.quote.depositAddress) : undefined;
    if (signed?.status === "valid" && !signed.noChecksum) {
      return r("pass", "Valid format", "Valid, no checksum", "Address format is valid. It's all lowercase, so we couldn't use its checksum and compared it with the signed quote character by character instead.");
    }
    return r("warn", "No checksum", "Valid, no checksum", "This address is all lowercase, so we can't use its checksum. We compared it character by character instead.");
  }
  return r("pass", "Valid format", "Valid", "Address format is valid for this network.");
};

// ---------------------------------------------------------------- token

const token: Rule = (c) => {
  if (!c.originToken) {
    return r("unknown", "Token unknown", "Couldn't look up", "We couldn't look up the token this quote expects. Try again in a minute.", { expected: { asset: c.qr.quoteRequest.originAsset } });
  }
  const want = c.originToken;
  const expected = { asset: want.assetId, symbol: want.symbol, contract: want.contractAddress ?? "native" };
  const wantName = `${want.symbol} on ${chainName(want.blockchain)}`;
  if (!c.asset) {
    return r("unknown", "Pick your token", "Not chosen yet", "Tell us which token you're sending so we can compare it with the quote.", { expected });
  }
  const lookupChain = c.declaredChain ?? c.originChain;
  const got = resolveDeclaredToken(c.tokens, lookupChain, c.asset);
  if (!got && c.declaredChain === c.originChain && c.asset.toLowerCase() !== "native" && !/^(nep141|nep245|1cs_v1):/.test(c.asset)) {
    return r("block", "Wrong token", `Not ${want.symbol}`, `Wrong token. This token isn't one NEAR Intents accepts on ${chainName(c.originChain!)}. The quote expects ${want.symbol}${want.contractAddress ? ` at ${shortAddress(want.contractAddress)}` : ""}.`, { expected, actual: { contract: c.asset }, action: { kind: "edit-send", label: "Change token" } });
  }
  if (!got) {
    return r("unknown", "Token not recognised", "Not recognised", `We don't recognise this token on ${lookupChain ? chainName(lookupChain) : "that network"}, so we can't compare it with the quote.`, { expected, actual: { asset: c.asset } });
  }
  const actual = { asset: got.assetId, symbol: got.symbol, contract: got.contractAddress ?? "native" };
  if (got.assetId === want.assetId) {
    return r("pass", "Right token", want.symbol, `Right token. ${wantName} matches the quote.`, { expected, actual });
  }
  if (got.symbol.toUpperCase() !== want.symbol.toUpperCase()) {
    return r("block", "Wrong token", `${got.symbol}, not ${want.symbol}`, `Wrong token. The quote expects ${want.symbol}. You're about to send ${got.symbol}.`, { expected, actual, action: { kind: "edit-send", label: "Change token" } });
  }
  if (got.blockchain !== want.blockchain) {
    // Same token name on another network; the network check reports the real problem.
    return r("pass", "Same token", want.symbol, `${got.symbol}, the same token as the quote. Check the network row.`, { expected, actual });
  }
  const viaTx = c.decoded?.kind === "erc20-transfer" || c.decoded?.kind === "native";
  return r(viaTx ? "block" : "warn", "Different token contract", `Another ${got.symbol}`, `Same name, different token. The quote wants ${want.symbol} ${want.contractAddress ? shortAddress(want.contractAddress) : "(native)"}, but you picked ${got.symbol} ${got.contractAddress ? shortAddress(got.contractAddress) : "(native)"}. Check the token in your wallet.`, { expected, actual, action: { kind: "edit-send", label: "Change token" } });
};

// ---------------------------------------------------------------- memo

const memo: Rule = (c) => {
  const want = c.qr.quote.depositMemo ?? null;
  const modeMemo = c.qr.quoteRequest.depositMode === "MEMO";
  if (!want) {
    if (modeMemo) {
      return r("unknown", "Memo unknown", "Memo missing from quote", "This quote is in memo mode but didn't include a memo. Don't send until your app shows one.");
    }
    if (c.memo) {
      return r("info", "Memo not needed", "Not needed", "This swap doesn't use a memo. You can leave it out.", { actual: { memo: c.memo } });
    }
    return null;
  }
  const expected = { memo: want };
  if (c.memo === null) {
    return r("block", "Memo missing", "Missing", "Memo missing. This deposit needs the memo shown above. Without it, your funds can't be matched to your swap.", { expected, actual: { memo: null }, action: { kind: "edit-send", label: "Add the memo" } });
  }
  if (c.memo !== want) {
    return r("block", "Wrong memo", "Doesn't match", `Wrong memo. Use exactly ${want}. Without the right memo, your funds can't be matched to your swap.`, { expected, actual: { memo: c.memo }, action: { kind: "edit-send", label: "Fix the memo" } });
  }
  if (c.source === "exchange") {
    return r("warn", "Exchange and memo", "Matches, check exchange", "Memo matches. Some exchanges have no memo field. If you can't add the memo, don't send from there.", { expected, actual: { memo: c.memo } });
  }
  return r("pass", "Memo matches", "Matches", "Memo matches. Keep it exactly as shown.", { expected, actual: { memo: c.memo } });
};

// ---------------------------------------------------------------- amount

const amount: Rule = (c) => {
  const q = c.qr.quote;
  const type = c.qr.quoteRequest.swapType;
  if (type === "ANY_INPUT") {
    return r("block", "Unsupported swap type", "ANY_INPUT", "This quote type collects deposits for partner apps and is not meant for personal sends. Neer doesn't support it.");
  }
  const amountIn = BigInt(q.amountIn);
  const minIn = BigInt(q.minAmountIn);
  const expected = { swapType: type, amountIn: q.amountIn, minAmountIn: q.minAmountIn };
  if (c.amount === undefined) {
    return r("unknown", "Enter the amount", "Not entered", "Enter the amount you'll send so we can compare it with the quote.", { expected });
  }
  if (c.asset && c.originToken) {
    const got = resolveDeclaredToken(c.tokens, c.declaredChain ?? c.originChain, c.asset);
    if (got && got.decimals !== c.originToken.decimals) {
      return r("unknown", "Can't compare", "Different token", "You're sending a different token than the quote, so we can't compare amounts.", { expected, actual: { amount: c.amount.toString() } });
    }
  }
  const sent = c.amount;
  const actual = { amount: sent.toString() };
  const need = type === "EXACT_INPUT" ? amountIn : minIn;
  if (sent < need) {
    return r("block", "Too little", `${fmtOrigin(c, sent)}, needs ${fmtOrigin(c, need)}`, `Too little. This swap needs ${fmtOrigin(c, need)}. If you send ${fmtOrigin(c, sent)} it will be refunded, not swapped.`, { expected, actual, action: { kind: "edit-send", label: "Change amount" } });
  }
  if (type !== "FLEX_INPUT" && sent > amountIn) {
    return r("warn", "More than needed", `${fmtOrigin(c, sent)}`, `You're sending more than needed. The extra ${fmtOrigin(c, sent - amountIn)} comes back to your refund address after the swap.`, { expected, actual });
  }
  if (type === "EXACT_OUTPUT" && sent < amountIn) {
    return r("pass", "Amount is enough", fmtOrigin(c, sent), `Amount is enough. The quote suggests ${fmtOrigin(c, amountIn)}; at least ${fmtOrigin(c, minIn)} is needed.`, { expected, actual });
  }
  if (type === "FLEX_INPUT") {
    return r("pass", "Amount is enough", fmtOrigin(c, sent), `Amount is enough. This swap accepts at least ${fmtOrigin(c, minIn)}.`, { expected, actual });
  }
  return r("pass", "Amount is right", fmtOrigin(c, sent), `Amount is right. Send exactly ${fmtOrigin(c, sent)}.`, { expected, actual });
};

// ---------------------------------------------------------------- minimum

const minimum: Rule = (c) => {
  const req = c.qr.quoteRequest;
  if (req.depositType !== "ORIGIN_CHAIN" || req.recipientType !== "DESTINATION_CHAIN") return null;
  const usd = parseUsdMicros(c.qr.quote.amountInUsd);
  if (usd === undefined) return r("unknown", "USD value unknown", "No USD value", "We couldn't read the dollar value of this swap, so we can't check network minimums.");
  if (!c.originChain || !c.destChain) return r("unknown", "Minimum unknown", "Network unknown", "We couldn't look up the networks for this swap, so we can't check network minimums.");
  const m = c.rules.minimums;
  const min1000 = parseUsdMicros(m.usd1000)!;
  const minTron = parseUsdMicros(m.tronOriginUsd)!;
  const sides = [c.originChain, c.destChain].filter((ch) => m.usd1000Chains.includes(ch));
  const actual = { usd: formatUsd(usd) };
  if (sides.length > 0 && usd < min1000) {
    const name = chainName(sides[0]!);
    return r("block", "Below the minimum", `${formatUsd(usd)}, minimum $1,000`, `Below the minimum. Swaps on ${name} under $1,000 are paused right now. Yours is ${formatUsd(usd)}. Try a larger amount or another network.`, { expected: { minUsd: m.usd1000 }, actual });
  }
  if (c.originChain === "tron" && usd < minTron) {
    return r("block", "Below the minimum", `${formatUsd(usd)}, minimum $100`, `Below the minimum. Swaps from Tron under $100 are paused right now. Yours is ${formatUsd(usd)}. Try a larger amount or another network.`, { expected: { minUsd: m.tronOriginUsd }, actual });
  }
  const ageDays = (c.now.getTime() - new Date(m.checkedAt).getTime()) / 86_400_000;
  if (ageDays > c.rules.minimumsMaxAgeDays) {
    return r("warn", "Minimums may be out of date", "Rules not re-checked", `Network minimums change often. Ours were last checked on ${m.checkedAt.slice(0, 10)}.`, { actual });
  }
  return r("pass", "Above the minimum", "Above minimum", "Above the minimum for this network.", { actual });
};

// ---------------------------------------------------------------- xrp

const xrp: Rule = (c) => {
  const req = c.qr.quoteRequest;
  const targets: string[] = [];
  if (c.destChain === "xrp" && req.recipientType === "DESTINATION_CHAIN") targets.push(req.recipient);
  if (c.originChain === "xrp" && req.refundType === "ORIGIN_CHAIN") targets.push(req.refundTo);
  if (targets.length === 0) return null;
  for (const t of targets) {
    if (xrpDestinationTag(t) !== undefined) {
      return r("block", "XRP tag not supported", "Destination tag", "XRP destination tags aren't supported for this swap. Use an XRP address of your own wallet, without a tag.", { actual: { address: t } });
    }
    if (isXrpXAddress(t)) {
      return r("warn", "XRP X-address", "X-address", "This XRP X-address includes a destination tag, which may not be supported. Use a classic r… address of your own wallet.", { actual: { address: t } });
    }
    if (validateAddress("xrp", t).status !== "valid") {
      return r("block", "Invalid XRP address", "Not a valid XRP address", "This isn't a valid XRP address. Use an XRP address of your own wallet, without a tag.", { actual: { address: t } });
    }
  }
  return r("pass", "XRP address supported", "Classic address", "XRP address format is supported.");
};

// ---------------------------------------------------------------- refund

const refund: Rule = (c) => {
  const req = c.qr.quoteRequest;
  const to = req.refundTo;
  if (req.refundType === "INTENTS") {
    return r("info", "Refunds to Intents", "Intents account", `If anything goes wrong, refunds go to the NEAR Intents account ${shortAddress(to)}.`, { expected: { refundTo: to } });
  }
  if (req.refundType === "CONFIDENTIAL_INTENTS") return null; // covered by the confidential check
  if (!c.originChain) return r("unknown", "Refund unknown", "Network unknown", "We couldn't check the refund address because we don't know the network.");
  const name = chainName(c.originChain);
  const v = validateAddress(c.originChain, to);
  const expected = { refundTo: to };
  if (v.status === "invalid") {
    return r("block", "Refund address won't work", `Not a ${name} address`, `This refund address won't work on ${name}. If the swap fails, your refund can't reach you.`, { expected, action: { kind: "new-quote", label: "Get a new quote" } });
  }
  if (c.qr.quote.depositAddress && sameAddress(c.originChain, to, c.qr.quote.depositAddress)) {
    return r("block", "Refund to deposit address", "Same as deposit", "The refund address is the deposit address itself, so a refund could never reach you. Get a new quote with your own address.", { expected, action: { kind: "new-quote", label: "Get a new quote" } });
  }
  if (v.status === "unsupported") {
    return r("unknown", "Refund not checked", shortAddress(to), `We don't check ${name} addresses yet. Make sure you control ${shortAddress(to)}.`, { expected });
  }
  if (c.from) {
    if (sameAddress(c.originChain, to, c.from)) {
      return r("pass", "Refunds come back", shortAddress(to), `If anything goes wrong, refunds go back to your wallet ${shortAddress(to)}.`, { expected, actual: { from: c.from } });
    }
    return r("warn", "Refunds go elsewhere", shortAddress(to), `Refunds go to an address you're not sending from. Make sure you control ${shortAddress(to)}.`, { expected, actual: { from: c.from } });
  }
  return r("info", "Refund address", shortAddress(to), `If anything goes wrong, refunds go to ${shortAddress(to)}. Make sure that's an address you control.`, { expected });
};

// ---------------------------------------------------------------- approval and dust

const approval: Rule = (c) => {
  const d = c.decoded;
  const refundFee = c.qr.quote.refundFee ? BigInt(c.qr.quote.refundFee) : undefined;
  if (d?.kind === "approval") {
    return r("block", "Not a deposit", d.method, "This isn't a deposit. Your wallet is asking to approve spending, not to send. A NEAR Intents deposit never needs an approval.", { actual: { method: d.method } });
  }
  if (d?.kind === "other") {
    return r("block", "Not a plain transfer", `Call ${d.selector}`, "This isn't a plain transfer. A NEAR Intents deposit is a simple send of the token to the deposit address.", { actual: { selector: d.selector } });
  }
  if (c.amount !== undefined && refundFee !== undefined && c.amount > 0n && c.amount <= refundFee) {
    return r("warn", "Tiny amount", "At or below refund fee", "This amount is tiny. If it's refunded, fees could take most of it.", { expected: { refundFee: refundFee.toString() }, actual: { amount: c.amount.toString() } });
  }
  if (d) return r("pass", "Plain transfer", "No approvals", "This is a plain transfer. No approvals involved.");
  return r("info", "Plain transfer only", "Never approve", "A deposit is a plain transfer. If your wallet asks you to approve spending or sign a message, stop.");
};

// ---------------------------------------------------------------- confidential

const confidential: Rule = (c) => {
  const req = c.qr.quoteRequest;
  const conf = req.confidentiality ?? "public";
  const types = [req.depositType, req.refundType, req.recipientType];
  if (conf === "public" && !types.includes("CONFIDENTIAL_INTENTS")) return null;
  return r("warn", "Confidential swap", "Not supported", "Neer doesn't check confidential swaps yet, so we can't tell you if this one is right.");
};

// ---------------------------------------------------------------- exchange

const exchange: Rule = (c) => {
  if (c.source === "wallet") return r("pass", "Own wallet", "Your wallet", "Sending from your own wallet.");
  if (c.source === "exchange") {
    const need = c.qr.quoteRequest.swapType === "EXACT_INPUT" ? c.qr.quote.amountIn : c.qr.quote.minAmountIn;
    return r("warn", "Sending from an exchange", "Exchange", `Sending from an exchange? They often take a fee from the amount and can be slow. Make sure at least ${fmtOrigin(c, BigInt(need))} arrives, and that refunds go to a wallet you control.`);
  }
  return r("unknown", "Where from?", "Not chosen", "Tell us if you're sending from your own wallet or from an exchange.");
};

// ---------------------------------------------------------------- stale

const stale: Rule = (c) => {
  if (!c.fetchedAt) return null;
  const age = Math.floor((c.now.getTime() - c.fetchedAt.getTime()) / 1000);
  if (age > c.rules.statusMaxAgeSec) {
    return r("warn", "Checked a while ago", `${humanDuration(age)} ago`, `We last read this quote ${humanDuration(age)} ago. Run the checks again before you send.`, { actual: { ageSec: age } });
  }
  const priceAt = c.originToken?.priceUpdatedAt ? new Date(c.originToken.priceUpdatedAt) : null;
  if (priceAt) {
    const pAge = Math.floor((c.now.getTime() - priceAt.getTime()) / 1000);
    if (pAge > c.rules.priceMaxAgeSec) {
      return r("warn", "Prices are old", `Prices ${humanDuration(pAge)} old`, `Prices are ${humanDuration(pAge)} old, so the dollar value is approximate. Token amounts are still exact.`, { actual: { priceAgeSec: pAge } });
    }
  }
  return r("pass", "Fresh data", "Just now", "Checked just now.");
};

// ---------------------------------------------------------------- incident

const incident: Rule = () =>
  r("info", "Incidents not checked", "Not checked", "We can't read NEAR Intents incident reports without a partner key, so network delays aren't checked.");

export const RULES: { id: CheckResult["id"]; title: string; run: Rule }[] = [
  { id: "signature", title: "Quote", run: signature },
  { id: "used", title: "Address status", run: used },
  { id: "time", title: "Time left", run: time },
  { id: "lookalike", title: "Address match", run: lookalike },
  { id: "network", title: "Network", run: network },
  { id: "format", title: "Address format", run: format },
  { id: "token", title: "Token", run: token },
  { id: "memo", title: "Memo", run: memo },
  { id: "amount", title: "Amount", run: amount },
  { id: "minimum", title: "Network minimum", run: minimum },
  { id: "xrp", title: "XRP tag", run: xrp },
  { id: "refund", title: "Refund to", run: refund },
  { id: "approval", title: "Transfer type", run: approval },
  { id: "confidential", title: "Confidential swap", run: confidential },
  { id: "exchange", title: "Sending from", run: exchange },
  { id: "stale", title: "Freshness", run: stale },
  { id: "incident", title: "Network incidents", run: incident },
];

/** Checks that must be present for a Safe verdict. Missing ones become `unknown`. */
export const REQUIRED_CHECKS: CheckResult["id"][] = ["signature", "used", "time", "lookalike", "network", "token", "amount", "exchange"];

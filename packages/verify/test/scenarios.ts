import { createBase58check, base58xrp } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { getChain, type PreflightInput, type QuoteResponse, type Token } from "@neer/core";
import { legacy, NOW, quote, sign, OTHER, DEPOSIT } from "./fixtures.js";

type Change = (l: PreflightInput, q: QuoteResponse) => void;
function alt(l: PreflightInput, changes: Partial<Token>) {
  const token: Token = { ...l.tokens[0]!, assetId: "nep141:fake-alternative.omft.near", contractAddress: OTHER, ...changes };
  l.tokens.push(token); l.transfer.asset=token.assetId;
}
function origin(l: PreflightInput, chain: string) { l.tokens[0]!.blockchain=chain;l.transfer.chain=chain; }
function xrpTarget(l: PreflightInput, q: QuoteResponse, target: string) { l.tokens[1]!.blockchain="xrp";q.quoteRequest.recipient=target; }
function fakeTron(byte: number) {const a=new Uint8Array(21).fill(byte);a[0]=0x41;return createBase58check(sha256).encode(a);}
function fakeXrp(extended=false) {const a=new Uint8Array(extended?31:21).fill(0x11);a[0]=extended?0x05:0;if(extended)a[1]=0x44;return base58xrp.encode(Uint8Array.from([...a,...sha256(sha256(a)).slice(0,4)]));}
export const cases: Record<string, Change> = {
 QUOTE_PREVIEW:(_l,q)=>{q.quoteRequest.dry=true;},
 QUOTE_UNVERIFIED:(_l,q)=>{q.signature="invalid";},
 PARTNER_QUOTE_MISMATCH:(l)=>{const other=quote();other.quote.amountIn="6000000";l.quote=sign(other);},
 DEPOSIT_STATUS_UNKNOWN:(l,q)=>{l.quote=sign(q);l.lookup={kind:"not_found"};},
 DEPOSIT_IN_USE:(l)=>{if(l.lookup.kind==="found")l.lookup.status.status="PROCESSING";},
 DEPOSIT_INCOMPLETE:(l)=>{if(l.lookup.kind==="found")l.lookup.status.status="INCOMPLETE_DEPOSIT";},
 DEPOSIT_ALREADY_USED:(l)=>{if(l.lookup.kind==="found")l.lookup.status.status="SUCCESS";},
 QUOTE_DEADLINE_MISSING:(_l,q)=>{Reflect.deleteProperty(q.quoteRequest,"deadline");q.quote.deadline=null;},
 QUOTE_EXPIRED:(_l,q)=>{q.quoteRequest.deadline=NOW.toISOString();},
 QUOTE_TOO_CLOSE_TO_EXPIRY:(_l,q)=>{q.quoteRequest.deadline=new Date(NOW.getTime()+1000).toISOString();},
 QUOTE_NEAR_EXPIRY:(_l,q)=>{q.quoteRequest.deadline=new Date(NOW.getTime()+getChain("eth").confirmBudgetSec*1500).toISOString();},
 DEPOSIT_ADDRESS_INACTIVE:(_l,q)=>{q.quote.timeWhenInactive=NOW.toISOString();},
 QUOTE_DEPOSIT_ADDRESS_MISSING:(_l,q)=>{q.quote.depositAddress=null;},
 ADDRESS_LOOKALIKE:(l)=>{l.depositAddress=DEPOSIT.slice(0,10)+"0".repeat(22)+DEPOSIT.slice(-10);},
 ADDRESS_MISMATCH:(l)=>{l.depositAddress=OTHER;},
 SEND_ADDRESS_INVALID:(l)=>{l.transfer.to=DEPOSIT.replace(/[a-fA-F]/,(c)=>c===c.toUpperCase()?c.toLowerCase():c.toUpperCase());},
 INTENTS_DEPOSIT_UNSUPPORTED:(_l,q)=>{q.quoteRequest.depositType="INTENTS";},
 CONFIDENTIAL_DEPOSIT_UNSUPPORTED:(_l,q)=>{q.quoteRequest.depositType="CONFIDENTIAL_INTENTS";},
 ORIGIN_NETWORK_UNKNOWN:(l)=>{l.tokens=l.tokens.slice(1);},
 CHAIN_ID_UNKNOWN:(l)=>{l.transfer.chainId=99999999;},
 NETWORK_NOT_SELECTED:(l)=>{delete l.transfer.chain;},
 CHAIN_ID_CONFLICT:(l)=>{l.transfer.chainId=8453;},
 NETWORK_MISMATCH:(l)=>{l.transfer.chain="base";},
 FORMAT_NETWORK_UNKNOWN:(l)=>{l.tokens=l.tokens.slice(1);},
 ADDRESS_FORMAT_UNSUPPORTED:(l)=>{origin(l,"fakechain");},
 DEPOSIT_ADDRESS_INVALID:(l,q)=>{l.depositAddress="FAKE_INVALID_ADDRESS";q.quote.depositAddress=l.depositAddress;},
 ADDRESS_NO_CHECKSUM:(l,q)=>{l.depositAddress=DEPOSIT.toLowerCase();q.quote.depositAddress=l.depositAddress;},
 ORIGIN_TOKEN_UNKNOWN:(l)=>{l.tokens=[];},
 TOKEN_NOT_SELECTED:(l)=>{delete l.transfer.asset;},
 TOKEN_UNACCEPTED_CONTRACT:(l)=>{l.transfer.asset=OTHER;},
 TOKEN_UNRECOGNISED:(l)=>{l.transfer.asset="nep141:fake-unknown.omft.near";},
 TOKEN_SYMBOL_MISMATCH:(l)=>{alt(l,{symbol:"FAKE_OTHER"});},
 TOKEN_NETWORK_MISMATCH:(l)=>{alt(l,{blockchain:"base"});},
 TOKEN_CONTRACT_MISMATCH:(l)=>{alt(l,{});},
 QUOTE_MEMO_MISSING:(_l,q)=>{q.quoteRequest.depositMode="MEMO";},
 MEMO_MISSING:(_l,q)=>{q.quote.depositMemo="FAKE_MEMO_A";},
 MEMO_MISMATCH:(l,q)=>{q.quote.depositMemo="FAKE_MEMO_A";l.transfer.memo="FAKE_MEMO_B";},
 MEMO_EXCHANGE_WARNING:(l,q)=>{q.quote.depositMemo="FAKE_MEMO_A";l.transfer.memo="FAKE_MEMO_A";l.transfer.source="exchange";},
 SWAP_TYPE_UNSUPPORTED:(_l,q)=>{q.quoteRequest.swapType="ANY_INPUT";},
 AMOUNT_MISSING:(l)=>{delete l.transfer.amount;},
 AMOUNT_TOKEN_PRECISION_MISMATCH:(l)=>{alt(l,{decimals:18});},
 AMOUNT_BELOW_QUOTE:(l)=>{l.transfer.amount="4000000";},
 AMOUNT_ABOVE_QUOTE:(l)=>{l.transfer.amount="6000000";},
 MINIMUM_USD_UNKNOWN:(_l,q)=>{q.quote.amountInUsd="FAKE_NOT_USD";},
 MINIMUM_NETWORK_UNKNOWN:(l)=>{l.tokens=l.tokens.slice(0,1);},
 MINIMUM_RULES_STALE:(l)=>{l.rules={...l.rules!,minimums:{...l.rules!.minimums,checkedAt:new Date(NOW.getTime()-15*86400000).toISOString()}};},
 MINIMUM_NETWORK_1000:(l)=>{origin(l,"bsc");},
 MINIMUM_TRON_100:(l,q)=>{origin(l,"tron");l.depositAddress=fakeTron(0x11);q.quote.depositAddress=l.depositAddress;q.quoteRequest.refundTo=fakeTron(0x22);},
 XRP_DESTINATION_TAG_UNSUPPORTED:(l,q)=>{xrpTarget(l,q,fakeXrp()+":123");},
 XRP_XADDRESS_WARNING:(l,q)=>{xrpTarget(l,q,fakeXrp(true));},
 XRP_ADDRESS_INVALID:(l,q)=>{xrpTarget(l,q,"FAKE_INVALID_XRP");},
 REFUND_NETWORK_UNKNOWN:(l)=>{l.tokens=l.tokens.slice(1);},
 REFUND_ADDRESS_INVALID:(_l,q)=>{q.quoteRequest.refundTo="FAKE_INVALID_REFUND";},
 REFUND_TO_DEPOSIT_ADDRESS:(_l,q)=>{q.quoteRequest.refundTo=DEPOSIT;},
 REFUND_FORMAT_UNSUPPORTED:(l)=>{origin(l,"fakechain");},
 REFUND_DIFFERS_FROM_SENDER:(l)=>{l.transfer.from=OTHER;},
 DRAFT_NETWORK_UNSUPPORTED:(l)=>{origin(l,"near");l.transfer.tx={to:DEPOSIT,value:"5000000"};},
 DRAFT_APPROVAL:(l)=>{l.transfer.tx={to:DEPOSIT,data:"0x095ea7b3"};},
 DRAFT_NOT_PLAIN_TRANSFER:(l)=>{l.transfer.tx={to:DEPOSIT,data:"0x12345678"};},
 AMOUNT_AT_OR_BELOW_REFUND_FEE:(l)=>{l.transfer.amount="1000";},
 CONFIDENTIAL_SWAP_UNSUPPORTED:(_l,q)=>{q.quoteRequest.confidentiality="basic";},
 SOURCE_EXCHANGE:(l)=>{l.transfer.source="exchange";},
 SOURCE_UNKNOWN:(l)=>{l.transfer.source="unknown";},
 STATUS_STALE:(l)=>{if(l.lookup.kind==="found")l.lookup.fetchedAt=new Date(NOW.getTime()-61000);},
 TOKEN_PRICE_STALE:(l)=>{l.tokens[0]!.priceUpdatedAt=new Date(NOW.getTime()-901000).toISOString();},
 RULE_EXECUTION_FAILED:()=>{},
 REQUIRED_CHECK_MISSING:()=>{},
 QUOTE_NOT_FOUND:(l)=>{l.lookup={kind:"not_found"};},
 QUOTE_UNAVAILABLE:(l)=>{l.lookup={kind:"error",reason:"timeout"};},
};

export function scenario(code: string): PreflightInput {
 const l=legacy();if(l.lookup.kind!=="found")throw new Error("fixture invariant");
 const q=l.lookup.status.quoteResponse;cases[code]!(l,q);
 if(code!=="QUOTE_UNVERIFIED" && l.lookup.kind==="found") l.lookup.status.quoteResponse=sign(q);
 return l;
}


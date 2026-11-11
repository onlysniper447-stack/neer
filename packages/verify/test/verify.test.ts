import { describe, expect, it, vi } from "vitest";
import { OneClickClient } from "@neer/oneclick";
import { createQuoteFetcher, verifyDeposit, verifyLegacyPreflight, VerifyInputError, VERIFY_VERSION, type VerifyInput } from "../src/index.js";
import { bundle, legacy, deps, input, NOW, sign, TOKEN, DEPOSIT } from "./fixtures.js";

function changed(mutate: (q: ReturnType<typeof bundle>) => void) {
  const b = bundle(); mutate(b);
  if (b.lookup.kind === "found") b.lookup.status.quoteResponse = sign(b.lookup.status.quoteResponse);
  return { ...deps(), fetchQuote: async () => b };
}
describe("public verifier", () => {
  it("passes only complete matching details and emits the exact minimal shape", async () => {
    const r = await verifyDeposit(input(), deps());
    expect(r).toEqual({ status: "pass", findings: [], quote: { verified: true, network: "eth", token: TOKEN, amount: "5", minimumAmount: "5", expiresAt: new Date(NOW.getTime()+3600000).toISOString(), swapType: "EXACT_INPUT" }, checkedAt: NOW.toISOString(), version: VERIFY_VERSION });
    expect(Object.keys(r)).toEqual(["status","findings","quote","checkedAt","version"]);
    const text=JSON.stringify(r); for(const forbidden of [DEPOSIT,"fake-recipient","refundTo","signedQuote","actual","expected","signature"]) expect(text).not.toContain(forbidden);
  });
  it("maps unknown source to warn, never pass", async () => {
    const r=await verifyDeposit({ ...input(),source: undefined },deps());
    expect(r.status).toBe("warn");expect(r.findings).toEqual([{code:"SOURCE_UNKNOWN",severity:"warn",message:"Tell us if you're sending from your own wallet or from an exchange.",fix:"Say wallet or exchange."}]);
  });
  it("blocks a network mismatch without inventing token or amount errors", async () => {
    const r=await verifyDeposit({...input(),network:"base"},deps());
    expect(r.status).toBe("block");expect(r.findings.map((f)=>f.code)).toEqual(["NETWORK_MISMATCH"]);
  });
  it("combines warnings and blocks; block wins", async () => {
    const r=await verifyDeposit({...input(),network:"base",source:"exchange"},deps());
    expect(r.status).toBe("block");expect(r.findings.some((f)=>f.severity==="warn")).toBe(true);
  });
  it("checks expired and below-quote amount cases", async () => {
    expect((await verifyDeposit({...input(),amount:"4"},deps())).findings.some((f)=>f.code==="AMOUNT_BELOW_QUOTE")).toBe(true);
    const d=changed((b)=>{if(b.lookup.kind==="found")b.lookup.status.quoteResponse.quoteRequest.deadline=NOW.toISOString();});
    expect((await verifyDeposit(input(),d)).findings.some((f)=>f.code==="QUOTE_EXPIRED")).toBe(true);
  });
  it("keeps lookup and transfer memos separate", async () => {
    const d=changed((b)=>{if(b.lookup.kind==="found")b.lookup.status.quoteResponse.quote.depositMemo="FAKE_MEMO_A";});
    const fetch=vi.fn(d.fetchQuote!);
    const r=await verifyDeposit({...input(),lookupMemo:"FAKE_MEMO_A",memo:null},{...d,fetchQuote:fetch});
    expect(fetch).toHaveBeenCalledWith({depositAddress:DEPOSIT,lookupMemo:"FAKE_MEMO_A"});
    expect(r.findings.some((f)=>f.code==="MEMO_MISSING")).toBe(true);
    expect((await verifyDeposit({...input(),lookupMemo:"FAKE_MEMO_A",memo:"FAKE_MEMO_B"},d)).findings.some((f)=>f.code==="MEMO_MISMATCH")).toBe(true);
  });
  it("unavailable/rejected/invalid quote fetches never pass", async () => {
    for(const fetchQuote of [async()=>{throw new Error("not returned to caller");},async()=>({lookup:{kind:"error" as const,reason:"timeout" as const},tokens:[]}),async()=>({lookup:null,tokens:[]} as unknown as ReturnType<typeof bundle>)]) {
      const r=await verifyDeposit(input(),{...deps(),fetchQuote});
      expect(r.status).toBe("block");expect(r.findings[0]?.code).toBe("QUOTE_UNAVAILABLE");
    }
  });
  it("does not authenticate an altered signed quote", async () => {
    const b=bundle();if(b.lookup.kind==="found")b.lookup.status.quoteResponse.quote.amountIn="7000000";
    const r=await verifyDeposit(input(),{...deps(),fetchQuote:async()=>b});
    expect(r.status).toBe("block");expect(r.quote).toBeNull();expect(r.findings.some((f)=>f.code==="QUOTE_UNVERIFIED")).toBe(true);
  });
  it("uses human decimals with selected-token precision, never floats", async () => {
    const b=bundle();b.tokens[0]!.decimals=18;
    if(b.lookup.kind==="found"){ const q=b.lookup.status.quoteResponse;q.quote.amountIn="1234567890123456789";q.quote.minAmountIn=q.quote.amountIn;q.quoteRequest.amount=q.quote.amountIn;b.lookup.status.quoteResponse=sign(q); }
    const r=await verifyDeposit({...input(),amount:"1.234567890123456789"},{...deps(),fetchQuote:async()=>b});
    expect(r.status).toBe("pass");expect(r.quote?.amount).toBe("1.234567890123456789");
    await expect(verifyDeposit({...input(),amount:"5.0000001"},deps())).rejects.toBeInstanceOf(VerifyInputError);
  });
  it("bounds converted base units and never echoes unknown field names",async()=>{
    await expect(verifyDeposit({...input(),amount:"9".repeat(256)},deps())).rejects.toBeInstanceOf(VerifyInputError);
    try { await verifyDeposit({...input(),[DEPOSIT]:"FAKE_VALUE"} as VerifyInput,deps()); }
    catch(err) {expect(err).toBeInstanceOf(VerifyInputError);expect(JSON.stringify((err as VerifyInputError).issues)).not.toContain(DEPOSIT);}
  });
  it("fails closed without metadata; does not guess decimals", async () => {
    const b=bundle();b.tokens=[];const r=await verifyDeposit(input(),{...deps(),fetchQuote:async()=>b});
    expect(r.status).toBe("warn");expect(r.findings.some((f)=>f.code==="ORIGIN_TOKEN_UNKNOWN")).toBe(true);
  });
  it("preserves optional source and numeric/draft context", async () => {
    const r=await verifyDeposit({...input(),transfer:{chainId:8453}},deps());
    expect(r.status).toBe("block");expect(r.findings.some((f)=>f.code==="CHAIN_ID_CONFLICT")).toBe(true);
  });
  it("rejects unsupported quoteId, symbols, malformed amounts and unknown nested fields", async () => {
    for(const bad of [{...input(),quoteId:"FAKE_DEFERRED"},{...input(),token:"USDC"},{...input(),amount:"1,5"},{...input(),amount:"1e6"},{...input(),transfer:{unexpected:true}}]) {
      await expect(verifyDeposit(bad as VerifyInput,deps())).rejects.toBeInstanceOf(VerifyInputError);
    }
  });
  it("reuses the existing client and forwards address/memo without a new HTTP layer", async () => {
    const b=bundle();const client=new OneClickClient({fetch:vi.fn()});
    const status=vi.spyOn(client,"getStatus").mockResolvedValue(b.lookup);
    vi.spyOn(client,"getTokens").mockResolvedValue({ok:true,tokens:b.tokens});
    expect(await createQuoteFetcher(client)({depositAddress:DEPOSIT,lookupMemo:"FAKE_MEMO"})).toEqual(b);
    expect(status).toHaveBeenCalledWith(DEPOSIT,"FAKE_MEMO");
  });
});

it("provides the complete canonical-input legacy result while leaving public projection identical",async()=>{
 const { verifyDepositWithLegacy }=await import("../src/index.js");
 const { projectVerification }=await import("../src/projection.js");
 const result=await verifyDepositWithLegacy(input(),deps());
 expect(result).toEqual(await verifyLegacyPreflight(legacy()));
 expect(projectVerification(result)).toEqual(await verifyDeposit(input(),deps()));
 expect(result.signedQuote).not.toBeNull();expect(result.checksHash.length).toBeGreaterThan(0);
});

it("keeps omitted source unknown in the full legacy path, never safe",async()=>{
 const { verifyDepositWithLegacy }=await import("../src/index.js");
 const result=await verifyDepositWithLegacy({...input(),source:undefined},deps());
 expect(result.verdict).toBe("check");expect(result.checks.find(c=>c.id==="exchange")?.severity).toBe("unknown");
});

describe("expectedRecipient (1.1.0)", () => {
  it("without a receiving address the same matching input is warn, never pass", async () => {
    const { expectedRecipient: _omit, ...rest } = input();
    const r = await verifyDeposit(rest, deps());
    expect(r.status).toBe("warn");
    expect(r.findings).toEqual([{ code: "RECIPIENT_NOT_PROVIDED", severity: "warn", message: "The quote sends the swapped funds to fake…near. Enter your own receiving address so Neer can compare it with the quote.", fix: "Pass expectedRecipient, the caller's own receiving address." }]);
    expect(JSON.stringify(r)).not.toContain("fake-recipient.near");
  });
  it("a different receiving address or destination network blocks", async () => {
    expect((await verifyDeposit({ ...input(), expectedRecipient: "other-account.near" }, deps())).findings.map((f) => f.code)).toEqual(["RECIPIENT_MISMATCH"]);
    expect((await verifyDeposit({ ...input(), expectedDestinationChain: "arb" }, deps())).findings.map((f) => f.code)).toEqual(["RECIPIENT_NETWORK_MISMATCH"]);
    expect((await verifyDeposit({ ...input(), expectedDestinationChain: "near" }, deps())).status).toBe("pass");
  });
  it("trims, length-limits and rejects links or bad network IDs", async () => {
    expect((await verifyDeposit({ ...input(), expectedRecipient: "  fake-recipient.near  " }, deps())).status).toBe("pass");
    for (const bad of [{ expectedRecipient: "https://fake.example/x" }, { expectedRecipient: "x".repeat(129) }, { expectedRecipient: "" }, { expectedRecipient: "has space" }, { expectedDestinationChain: "Arbitrum One" }]) {
      await expect(verifyDeposit({ ...input(), ...bad }, deps())).rejects.toBeInstanceOf(VerifyInputError);
    }
  });
});

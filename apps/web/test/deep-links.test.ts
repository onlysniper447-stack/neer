import { describe, expect, it } from "vitest";
import { copiedCheckLink, copyContext, LINK_ERROR, parseCheckQuery, queryRecord, verificationDraft, verificationParams } from "@/lib/deep-links";
const base={address:"FAKE_DEPOSIT_ADDRESS",network:"eth",token:"nep141:fake-usdc.omft.near",amount:"5"};
const parsed=()=>{const p=parseCheckQuery(base);if(p.kind!=="verify")throw Error("fake fixture invariant");return p.input;};
describe("strict checker link boundary",()=>{
 it("keeps empty and established address/memo lookup distinct from verification",()=>{
  expect(parseCheckQuery({})).toEqual({kind:"empty"});expect(parseCheckQuery({address:base.address})).toEqual({kind:"legacy",address:base.address});expect(parseCheckQuery({address:base.address,memo:"FAKE"})).toEqual({kind:"legacy",address:base.address,memo:"FAKE"});
 });
 it("maps all approved parameters into the canonical API shape",()=>{
  expect(parseCheckQuery({...base,memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP",source:"exchange",chainId:"1",from:"FAKE_FROM",to:"FAKE_TO"})).toMatchObject({kind:"verify",input:{depositAddress:base.address,network:"eth",token:base.token,amount:"5",memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP",source:"exchange",transfer:{chainId:1,from:"FAKE_FROM",to:"FAKE_TO"}}});
 });
 it("keeps omitted source unknown and supports explicit null versus omitted memos",()=>{
  expect(parsed().source).toBe("unknown");expect(parsed()).not.toHaveProperty("memo");expect(parseCheckQuery({...base,memo:"",lookupMemo:""})).toMatchObject({kind:"verify",input:{memo:null,lookupMemo:null}});
 });
 it.each(["address","network","token","amount"])("rejects incomplete new context missing %s",field=>{const q:{[key:string]:string}={...base};Reflect.deleteProperty(q,field);expect(parseCheckQuery(q).kind).toBe("invalid");});
 it.each(["quoteId","depositAddress","transfer","tx","utm_source","__proto__","constructor"])("rejects unknown/deferred %s even on legacy URLs",field=>{for(const q of [new URLSearchParams({...base}),new URLSearchParams({address:base.address})]){q.append(field,"FAKE_PRIVATE_VALUE");expect(parseCheckQuery(queryRecord(q))).toMatchObject({kind:"invalid",message:LINK_ERROR});}});
 it.each(["address","memo","network","token","amount","source","lookupMemo","chainId","from","to"])("rejects repeated %s without silently taking the first value",field=>{const q=new URLSearchParams({...base});q.append(field,"FAKE_A");q.append(field,"FAKE_B");expect(parseCheckQuery(queryRecord(q)).kind).toBe("invalid");});
 it.each(["-1","0","1.5","1e2","","9007199254740992"])("rejects invalid chainId %s",chainId=>{expect(parseCheckQuery({...base,chainId}).kind).toBe("invalid");});
 it.each([{amount:"1e5"},{amount:"-5"},{token:"USDC"},{memo:"FAKE SPACE"},{source:"FAKE_OTHER"},{address:"https://example.test"}])("rejects invalid canonical values %j",bad=>{expect(parseCheckQuery({...base,...bad}).kind).toBe("invalid");});
 it("bounds prefills and does not echo an unknown key/value in the error",()=>{
  const q=parseCheckQuery({...base,address:"a".repeat(10000),FAKE_PRIVATE_KEY:"FAKE_PRIVATE_VALUE"});expect(q.kind).toBe("invalid");if(q.kind!=="invalid")throw Error("expected invalid");expect(q.draft.address).toHaveLength(128);expect(q.message).not.toContain("FAKE_PRIVATE");expect(q.draft).not.toHaveProperty("FAKE_PRIVATE_KEY");
 });
 it("omits both memo names by default and includes each only with explicit consent",()=>{
  const input={...parsed(),memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP"};const no=new URL(copiedCheckLink("https://example.test",input));expect(no.pathname).toBe("/check");expect(no.search).not.toContain("FAKE_SEND");expect(no.search).not.toContain("FAKE_LOOKUP");expect(no.searchParams.has("memo")).toBe(false);expect(no.searchParams.has("lookupMemo")).toBe(false);
  const yes=new URL(copiedCheckLink("https://example.test",input,true));expect(yes.searchParams.get("memo")).toBe("FAKE_SEND");expect(yes.searchParams.get("lookupMemo")).toBe("FAKE_LOOKUP");
 });
 it("also excludes a standalone lookup memo and legacy memo without opt-in",()=>{expect(copiedCheckLink("https://example.test",{...parsed(),lookupMemo:"FAKE_LOOKUP"})).not.toContain("FAKE_LOOKUP");expect(copiedCheckLink("https://example.test",{address:base.address,memo:"FAKE_MEMO"})).not.toContain("FAKE_MEMO");expect(copiedCheckLink("https://example.test",{address:base.address,memo:"FAKE_MEMO"},true)).toContain("memo=FAKE_MEMO");});
 it("round trips human amounts, explicit null memo and all context without tx/quoteId",()=>{
  const input={...parsed(),amount:"5.123",memo:null,lookupMemo:"FAKE_LOOKUP",transfer:{chainId:1,from:"FAKE_FROM",to:"FAKE_TO"}};const params=verificationParams(input,true);expect(parseCheckQuery(queryRecord(params))).toMatchObject({kind:"verify",input});expect(verificationDraft(input).memo).toBe("");expect(params.has("quoteId")).toBe(false);expect(params.has("tx")).toBe(false);
 });
 it("invalidates copy opt-in context after every input/result revision",()=>{
  const input=parsed(),r={serverTime:"2026-11-07T15:30:00Z",checksHash:"FAKE_HASH"};const old=copyContext(input,r);
  for(const next of [{...input,memo:"FAKE_CHANGED"},{...input,lookupMemo:"FAKE_CHANGED"},{...input,amount:"6"},{...input,network:"base"}])expect(copyContext(next,r)).not.toBe(old);
  expect(copyContext(input,{...r,serverTime:"2026-11-07T15:31:00Z"})).not.toBe(old);expect(copyContext(input,{...r,checksHash:"FAKE_NEW"})).not.toBe(old);
 });
});

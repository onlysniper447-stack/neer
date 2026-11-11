import { VerifyInputSchema, type VerifyInput } from "@neer/verify";

export const LINK_FIELDS=["address","network","token","amount","memo","lookupMemo","recipient","recipientNetwork","source","chainId","from","to"] as const;
export type LinkField=(typeof LINK_FIELDS)[number];
export type LinkDraft=Partial<Record<LinkField,string>>;
export type QueryRecord=Record<string,string|string[]|undefined>;
export type CheckQuery={kind:"empty"}|{kind:"legacy";address:string;memo?:string}|{kind:"verify";input:VerifyInput;draft:LinkDraft}|{kind:"invalid";draft:LinkDraft;message:string};
export const LINK_ERROR="This verification link is invalid. Review the required fields and remove unsupported or repeated parameters.";
const allowed=new Set<string>(LINK_FIELDS);
export function queryRecord(params:URLSearchParams):QueryRecord {
 const out=Object.create(null) as QueryRecord;for(const [key,value] of params){const old=out[key];out[key]=old===undefined?value:Array.isArray(old)?[...old,value]:[old,value];}return out;
}
export function linkDraft(query:QueryRecord):LinkDraft {
 const out:LinkDraft={};for(const key of LINK_FIELDS){const value=query[key];if(typeof value==="string")out[key]=value.slice(0,key==="token"||key==="amount"?256:128);}return out;
}
/** Legacy address/memo lookup is not an incomplete automatic verification. */
export function parseCheckQuery(query:QueryRecord):CheckQuery {
 const keys=Object.keys(query).filter(k=>query[k]!==undefined);if(!keys.length)return {kind:"empty"};
 const draft=linkDraft(query);
 const invalid=():CheckQuery=>({kind:"invalid",draft,message:LINK_ERROR});
 if(keys.some(k=>!allowed.has(k)||Array.isArray(query[k])))return invalid();
 if(keys.every(k=>k==="address"||k==="memo"))return {kind:"legacy",address:typeof query.address==="string"?query.address:"",...(typeof query.memo==="string"?{memo:query.memo}:{})};
 const transfer=keys.some(k=>["chainId","from","to"].includes(k))?{
  ...(query.chainId===undefined?{}:{chainId:typeof query.chainId==="string"&&/^\d+$/.test(query.chainId)?Number(query.chainId):NaN}),
  ...(query.from===undefined?{}:{from:query.from}),...(query.to===undefined?{}:{to:query.to}),
 }:undefined;
 const result=VerifyInputSchema.safeParse({depositAddress:query.address,network:query.network,token:query.token,amount:query.amount,
  ...(query.memo===undefined?{}:{memo:query.memo===""?null:query.memo}),...(query.lookupMemo===undefined?{}:{lookupMemo:query.lookupMemo===""?null:query.lookupMemo}),
  ...(query.recipient===undefined?{}:{expectedRecipient:query.recipient}),...(query.recipientNetwork===undefined?{}:{expectedDestinationChain:query.recipientNetwork}),
  ...(query.source===undefined?{}:{source:query.source}),...(transfer?{transfer}:{}),
 });
 return result.success?{kind:"verify",input:result.data,draft}:invalid();
}
/** Memos and the receiving address are each left out of copied links unless the user opts in; both can identify them. */
export function verificationParams(input:VerifyInput,includeMemo=false,includeRecipient=false):URLSearchParams {
 const data=VerifyInputSchema.parse(input);const qs=new URLSearchParams({address:data.depositAddress,network:data.network,token:data.token,amount:data.amount,source:data.source});
 if(data.transfer?.chainId!==undefined)qs.set("chainId",String(data.transfer.chainId));
 if(data.transfer?.from!==undefined)qs.set("from",data.transfer.from);
 if(data.transfer?.to!==undefined)qs.set("to",data.transfer.to);
 if(includeMemo){if(data.memo!==undefined)qs.set("memo",data.memo??"");if(data.lookupMemo!==undefined)qs.set("lookupMemo",data.lookupMemo??"");}
 if(includeRecipient){if(data.expectedRecipient!==undefined)qs.set("recipient",data.expectedRecipient);if(data.expectedDestinationChain!==undefined)qs.set("recipientNetwork",data.expectedDestinationChain);}
 return qs;
}
export function verificationDraft(input:VerifyInput):LinkDraft {return linkDraft(queryRecord(verificationParams(input,true,true)));}
export function copiedCheckLink(origin:string,input:VerifyInput|{address:string;memo?:string|null},includeMemo=false,includeRecipient=false):string {
 const url=new URL("/check",origin);url.search="depositAddress" in input?verificationParams(input,includeMemo,includeRecipient).toString():new URLSearchParams({address:input.address,...(includeMemo&&input.memo?{memo:input.memo}:{})}).toString();return url.href;
}
/** A context key remounts opt-in consent on every input/result revision; never persisted. */
export function copyContext(input:unknown,result:{serverTime:string;checksHash:string}):string {return JSON.stringify([input,result.serverTime,result.checksHash]);}

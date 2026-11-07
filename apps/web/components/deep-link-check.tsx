"use client";
import { useId, useState } from "react";
import type { VerifyInput } from "@neer/verify";
import { LINK_FIELDS, parseCheckQuery, queryRecord, type LinkDraft } from "@/lib/deep-links";
import { ResultView, type ApiResult } from "./result-view";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const labels={address:"Deposit address",network:"Sending network ID",token:"Token asset ID",amount:"Amount in human units",memo:"Sending memo (optional)",lookupMemo:"Lookup memo (optional)",source:"Sending from",chainId:"EVM chain ID (optional)",from:"Declared sender (optional)",to:"Declared destination (optional)"};
export function DeepLinkCheck({draft,input,result,error}:{draft:LinkDraft;input?:VerifyInput;result?:ApiResult;error?:string}) {
 const id=useId();const [editing,setEditing]=useState(!result||!input);const [values,setValues]=useState<LinkDraft>({...draft,source:draft.source==="wallet"||draft.source==="exchange"?draft.source:"unknown"});const [message,setMessage]=useState(error??"");const [busy,setBusy]=useState(false);
 function submit(e:React.FormEvent<HTMLFormElement>){
  const form=new FormData(e.currentTarget);const params=new URLSearchParams();
  for(const key of LINK_FIELDS){const value=form.get(key);if(typeof value==="string"&&(value!==""||["address","network","token","amount","source"].includes(key)||((key==="memo"||key==="lookupMemo")&&draft[key]!==undefined)))params.set(key,value);}
  const parsed=parseCheckQuery(queryRecord(params));if(parsed.kind!=="verify"){e.preventDefault();setMessage("Enter a valid address, network, token asset ID and human amount. Review optional fields.");return;}
  setMessage("");setBusy(true); // Native GET navigation reruns even unchanged details; no client route cache replay.
 }
 return <div className="space-y-5" data-testid="deep-link-check" data-autocheck={result&&input&&!editing?"complete":"not-run"}>
  <h1 className="text-2xl font-semibold">Review the deposit details</h1>
  {!editing&&result&&input?<ResultView result={result} pastedAddress={input.depositAddress} pastedMemo={input.lookupMemo===undefined?input.memo??null:input.lookupMemo} verificationInput={input} sendSummary={`${input.amount} ${result.quote?.originSymbol ?? input.token} on ${result.quote?.originChainName ?? input.network}`} onEdit={()=>{setEditing(true);setMessage("");}} />:
   <form action="/check" method="get" onSubmit={submit} noValidate aria-busy={busy} className="mx-auto max-w-2xl space-y-4 rounded-xl border border-line p-5">
    <p className="text-sm text-muted">These details came from a link. Review them before deciding whether to send. Neer does not connect a wallet or send funds.</p>
    {message?<p role="alert" className="rounded-lg border border-stop p-3">{message}</p>:null}
    {LINK_FIELDS.map(key=><div key={key} className="space-y-1"><label className="block font-medium" htmlFor={`${id}-${key}`}>{labels[key]}</label>{key==="source"?
     <select id={`${id}-${key}`} name={key} value={values.source} onChange={e=>setValues(v=>({...v,source:e.target.value}))} className="min-h-11 w-full rounded-md border border-line bg-bg p-2"><option value="unknown">Unknown</option><option value="wallet">My own wallet</option><option value="exchange">An exchange</option></select>:
     <Input id={`${id}-${key}`} name={["address","network","token","amount"].includes(key)||Boolean(values[key])||((key==="memo"||key==="lookupMemo")&&draft[key]!==undefined)?key:undefined} value={values[key]??""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))} maxLength={key==="token"||key==="amount"?256:128} autoComplete="off" spellCheck={false} inputMode={key==="amount"?"decimal":key==="chainId"?"numeric":undefined} />}</div>)}
    <p className="text-xs text-muted">Running a linked check puts these details in the URL. Browser history and hosting or provider logs may retain them.</p>
    <Button type="submit" disabled={busy}>{busy?"Running checks…":"Run checks"}</Button>
   </form>}
 </div>;
}

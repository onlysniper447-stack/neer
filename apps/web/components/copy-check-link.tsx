"use client";
import { useId, useState } from "react";
import type { VerifyInput } from "@neer/verify";
import { copiedCheckLink } from "@/lib/deep-links";
import { Button } from "@/components/ui/button";

export function CopyCheckLink({input}:{input:VerifyInput|{address:string;memo?:string|null}}) {
 const [includeMemo,setIncludeMemo]=useState(false);const [includeRecipient,setIncludeRecipient]=useState(false);const [status,setStatus]=useState("");const id=useId();
 const hasRecipient="depositAddress" in input&&(input.expectedRecipient!==undefined||input.expectedDestinationChain!==undefined);
 async function copy(){try{await navigator.clipboard.writeText(copiedCheckLink(window.location.origin,input,includeMemo,hasRecipient&&includeRecipient));setStatus("Link copied.");}catch{setStatus("Your browser could not copy the link.");}}
 return <div className="space-y-2 rounded-xl border border-line p-3">
  <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm"><input id={id} type="checkbox" checked={includeMemo} onChange={e=>{setIncludeMemo(e.target.checked);setStatus("");}} />Include memo in link</label>
  <p className="text-xs text-muted">This includes both sending and lookup memos. Shared URLs can appear in history and hosting logs.</p>
  {hasRecipient?<>
   <label htmlFor={`${id}-recipient`} className="flex min-h-11 items-center gap-2 text-sm"><input id={`${id}-recipient`} type="checkbox" checked={includeRecipient} onChange={e=>{setIncludeRecipient(e.target.checked);setStatus("");}} />Include receiving address in link</label>
   <p className="text-xs text-muted">Your receiving address can identify your wallet. Without it, whoever opens the link has to enter their own.</p>
  </>:null}
  <Button type="button" variant="outline" onClick={copy}>Copy link</Button>
  <p role="status" className="text-sm text-muted">{status}</p>
 </div>;
}

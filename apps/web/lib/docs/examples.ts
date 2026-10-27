import block from "./examples/pf-block.json";
import badRequest from "./examples/pf-400.json";
import notFound from "./examples/pf-404.json";
import unsupported from "./examples/pf-422.json";
import safe from "./examples/pf-safe.json";
import track from "./examples/track.json";
import trackBadRequest from "./examples/track-400.json";

/**
 * Real responses captured from this API running against the live 1Click API on
 * 2026-10-27 (a fresh 5 USDC Arbitrum -> Solana quote; nothing was sent). A
 * unit test keeps their shape in sync with the service.
 */
export const EXAMPLES = { safe, block, badRequest, notFound, unsupported, track, trackBadRequest };

export const EXAMPLE_ADDRESS = safe.quote.depositAddress;

export const SAFE_REQUEST = {
  deposit: { address: EXAMPLE_ADDRESS, memo: null },
  transfer: { chain: "arb", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", amount: "5000000", source: "wallet" },
};

export const BLOCK_REQUEST = {
  deposit: { address: EXAMPLE_ADDRESS, memo: null },
  transfer: { chain: "base", asset: "native", amount: "2000000000000000", source: "wallet" },
};

/** Pretty JSON with long parts replaced by comments, so the shape stays readable. */
export function abridged(body: Record<string, unknown>, keep: string[] = ["signature", "network", "amount"]): string {
  const copy: Record<string, unknown> = { ...body };
  let more = 0;
  if (Array.isArray(copy.checks)) {
    const all = copy.checks as { id: string }[];
    const kept = keep.map((id) => all.find((c) => c.id === id)).filter((c): c is { id: string } => Boolean(c));
    const shown = kept.length ? kept : all.slice(0, 3);
    more = all.length - shown.length;
    copy.checks = more > 0 ? [...shown, "__MORE__"] : shown;
  }
  if (copy.signedQuote) copy.signedQuote = "__SIGNED__";
  if (Array.isArray(copy.timeline) && copy.timeline.length > 2) copy.timeline = [...copy.timeline.slice(0, 2), "__MORE_STEPS__"];
  return JSON.stringify(copy, null, 2)
    .replace('"__MORE__"', `/* ${more} more checks */`)
    .replace('"__SIGNED__"', "{ /* the 1Click quote exactly as signed: timestamp, signature, quoteRequest, quote */ }")
    .replace('"__MORE_STEPS__"', "/* 2 more steps */");
}

export function curlPost(origin: string, path: string, body: unknown): string {
  const json = JSON.stringify(body, null, 2).replace(/\n/g, "\n  ");
  return `curl -X POST ${origin}${path} \\\n  -H 'content-type: application/json' \\\n  -d '${json}'`;
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { ExternalLink, PageHeader, Section } from "@/components/page-header";
import { Toc } from "@/components/toc";
import { TryPreflight, TryTrack } from "@/components/try-it";
import { BLOCK_REQUEST, EXAMPLES, EXAMPLE_ADDRESS, SAFE_REQUEST, abridged, curlPost } from "@/lib/docs/examples";
import { requestOrigin } from "@/lib/origin";

export const metadata: Metadata = { title: "API docs", description: "Neer's preflight and track API, error codes, rate limits, CORS and the <NeerGuard/> React widget." };

const TOC = [
  { id: "overview", title: "Overview" },
  { id: "preflight", title: "POST /api/v1/preflight" },
  { id: "track", title: "GET /api/v1/track" },
  { id: "errors", title: "Errors" },
  { id: "limits", title: "Rate limits" },
  { id: "cors", title: "CORS" },
  { id: "widget", title: "<NeerGuard/> widget" },
  { id: "try", title: "Try it" },
];

const REQUEST_FIELDS: [string, string, string][] = [
  ["deposit.address", "string, required", "The 1Click deposit address you'll send to. Spaces, hidden characters and links are refused (400)."],
  ["deposit.memo", "string | null", "The deposit memo, for memo networks such as Stellar."],
  ["transfer.chain", "string", "1Click network id of the send, e.g. eth, base, arb, sol."],
  ["transfer.asset", "string", '"native", a token contract, or a 1Click assetId.'],
  ["transfer.amount", "string", "Amount in base units, as an integer string."],
  ["transfer.source", '"wallet" | "exchange" | "unknown"', "Where the money comes from. Default unknown, which can't be Safe to send."],
  ["transfer.chainId", "number", "The wallet's EVM chain id. A mismatch with the quote's network blocks."],
  ["transfer.from", "string", "Your sending address, compared with the refund address."],
  ["transfer.to", "string", "The address on the wallet's send screen, to catch clipboard swaps and lookalikes."],
  ["transfer.memo", "string | null", "The memo you'll attach. Omit to use deposit.memo."],
  ["transfer.tx", "{ to, data?, value?, chainId? }", "Unsigned draft transaction. Neer decodes it to catch approvals and wrong recipients."],
  ["quote", "object | null", "Optional signed 1Click quote you already have. It must match the one 1Click returns for the address."],
];

const RESPONSE_FIELDS: [string, string][] = [
  ["verdict", '"safe" | "check" | "block"'],
  ["label", "Safe to send, Check this, or Don't send"],
  ["headline, message", "Plain-English reason and what to do"],
  ["checks[]", "Every check that applied: id, title, severity (pass, info, warn, unknown, block), headline, summary, message, expected, actual, action"],
  ["quote", "Summary of the signed quote (networks, symbols, amounts, deadline, refund address), or null"],
  ["signedQuote", "The 1Click quote exactly as signed. Keep it to resolve disputes"],
  ["rulesVersion, checksHash", "Which rules ran, and a hash of the check results"],
  ["serverTime, requestId", "When it ran, and an id for support (also in X-Request-Id)"],
  ["outcome", '"checked", "not_found" or "unavailable"'],
];

const ERRORS: [string, string, string][] = [
  ["400", "NEER_INVALID_INPUT", "Body isn't JSON, is over 64 KB, or fails validation. issues[] lists each field."],
  ["404", "NEER_QUOTE_NOT_FOUND", "1Click has no quote for this address (and memo). The body still carries verdict block."],
  ["422", "NEER_UNSUPPORTED_CHAIN", "transfer.chain isn't a network Neer or 1Click knows."],
  ["422", "NEER_QUOTE_UNVERIFIED", "The quote's signature didn't verify. Verdict block."],
  ["429", "NEER_RATE_LIMITED", "Too many requests. Wait for Retry-After seconds."],
  ["503", "NEER_UPSTREAM_UNAVAILABLE", "1Click didn't answer or timed out (8 s). Verdict check, never safe."],
];

const WIDGET = `import { NeerGuard, NeerStatus } from "@neer/react";

export function SendButton({ address, amount }: { address: string; amount: string }) {
  return (
    <NeerGuard
      endpoint="https://your-neer-deployment.example"
      deposit={{ address }}
      transfer={{ chain: "arb", asset: "native", amount, source: "wallet" }}
    >
      {(guard) => (
        <>
          <button disabled={!guard.canSend}>Send</button>
          <NeerStatus guard={guard} />
        </>
      )}
    </NeerGuard>
  );
}`;

const HOOK = `import { useNeerPreflight } from "@neer/react";

const guard = useNeerPreflight({ endpoint, deposit, transfer, maxAgeMs: 60_000 });
// guard.canSend   true only for a fresh "safe" on exactly these inputs
// guard.verdict   "safe" | "check" | "block" | null
// guard.reason    first problem to show next to the button
// guard.recheck() run again`;

function Endpoint({ method, path }: { method: "GET" | "POST"; path: string }) {
  return (
    <p className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm">
      <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-semibold text-brand-ink">{method}</span>
      <span className="break-all">{path}</span>
    </p>
  );
}

function Table({ head, rows, mono = [0] }: { head: string[]; rows: string[][]; mono?: number[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label={`${head.join(", ")} table`}>
      <table className="w-full min-w-[36rem] text-left text-[15px]">
        <thead className="bg-surface text-sm text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={mono.includes(j) ? "px-4 py-2.5 font-mono text-[13px] whitespace-nowrap" : "px-4 py-2.5 text-muted"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-3 text-lg font-semibold">{children}</h3>;
}

export default async function DevelopersPage() {
  const origin = requestOrigin(await headers());
  return (
    <>
      <PageHeader eyebrow="API" title="Neer API">
        The checks behind the web app, as JSON. No API key, read-only, and fail-closed: errors never return Safe to send.
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] xl:gap-16">
        <Toc items={TOC} />
        <div className="min-w-0 max-w-5xl space-y-16">
          <Section id="overview" title="Overview">
            <ul className="space-y-2 text-muted">
              <li>
                Base URL: <code className="font-mono text-sm text-ink">{origin}</code>. Paths also work without <code className="font-mono text-sm text-ink">/api</code>{" "}
                (<code className="font-mono text-sm text-ink">/v1/preflight</code>).
              </li>
              <li>JSON in and out. Every response has <code className="font-mono text-sm text-ink">Cache-Control: no-store</code> and an <code className="font-mono text-sm text-ink">X-Request-Id</code>.</li>
              <li>Neer only reads public 1Click data (<code className="font-mono text-sm text-ink">/v0/status</code>, <code className="font-mono text-sm text-ink">/v0/tokens</code>). Preflight always reads the status fresh.</li>
              <li>The examples below are real responses from this API against the live 1Click API (a 5 USDC quote nobody funded).</li>
            </ul>
          </Section>

          <Section id="preflight" title="Run a preflight">
            <Endpoint method="POST" path="/api/v1/preflight" />
            <p className="mt-4 text-muted">
              Compares what you&apos;re about to send with the signed quote for the deposit address. Give at least <code className="font-mono text-sm text-ink">chain</code>,{" "}
              <code className="font-mono text-sm text-ink">asset</code> and <code className="font-mono text-sm text-ink">amount</code>; anything missing makes the related check Not
              confirmed, so the verdict can&apos;t be Safe.
            </p>
            <H3>Request</H3>
            <CodeBlock code={curlPost(origin, "/api/v1/preflight", SAFE_REQUEST)} title="curl" />
            <div className="mt-4">
              <Table head={["Field", "Type", "Meaning"]} rows={REQUEST_FIELDS} mono={[0, 1]} />
            </div>
            <H3>Response: 200, Safe to send (abridged)</H3>
            <CodeBlock code={abridged(EXAMPLES.safe)} title="200 application/json" />
            <details className="mt-3 rounded-xl border border-line">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium text-brand">Show the full response</summary>
              <div className="border-t border-line p-3">
                <CodeBlock code={JSON.stringify(EXAMPLES.safe, null, 2)} title="Full 200 response" />
              </div>
            </details>
            <H3>Response: 200, Don&apos;t send (same address, wrong network)</H3>
            <CodeBlock code={curlPost(origin, "/api/v1/preflight", BLOCK_REQUEST)} title="curl" />
            <CodeBlock className="mt-3" code={abridged(EXAMPLES.block, ["network", "token"])} title="200 application/json (abridged)" />
            <H3>Response fields</H3>
            <Table head={["Field", "Meaning"]} rows={RESPONSE_FIELDS} />
          </Section>

          <Section id="track" title="Track a deposit">
            <Endpoint method="GET" path="/api/v1/track?address=…&memo=…" />
            <p className="mt-4 text-muted">
              The swap status in plain English: label, message, timeline steps, deposited and refunded amounts, explorer links (https only), the quote summary and the signed quote.
              Reads are shared per address for 5 seconds, so polling every 5 seconds is fine.
            </p>
            <div className="mt-4 space-y-3">
              <CodeBlock code={`curl '${origin}/api/v1/track?address=${EXAMPLE_ADDRESS}'`} title="curl" />
              <CodeBlock code={abridged(EXAMPLES.track)} title="200 application/json (abridged)" />
            </div>
            <p className="mt-4 text-muted">
              <code className="font-mono text-sm text-ink">status</code> is one of PENDING_DEPOSIT, KNOWN_DEPOSIT_TX, PROCESSING, SUCCESS, INCOMPLETE_DEPOSIT, REFUNDED, FAILED.{" "}
              <code className="font-mono text-sm text-ink">terminal: true</code> means it won&apos;t change again; stop polling. See{" "}
              <Link href="/resources#statuses" className="font-medium text-brand underline underline-offset-4">
                what each status means
              </Link>
              .
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p className="mb-4 text-muted">
              Errors carry <code className="font-mono text-sm text-ink">error.code</code> and <code className="font-mono text-sm text-ink">error.message</code>. 404 and 503 from
              preflight also carry a verdict, which is never safe.
            </p>
            <Table head={["Status", "error.code", "When"]} rows={ERRORS} mono={[0, 1]} />
            <div className="mt-4 space-y-3">
              <CodeBlock code={JSON.stringify(EXAMPLES.badRequest, null, 2)} title="400 invalid body" />
              <CodeBlock code={JSON.stringify(EXAMPLES.unsupported, null, 2)} title="422 unknown network" />
              <CodeBlock code={abridged(EXAMPLES.notFound)} title="404 quote not found" />
              <CodeBlock code={JSON.stringify(EXAMPLES.trackBadRequest, null, 2)} title="400 track without an address" />
            </div>
          </Section>

          <Section id="limits" title="Rate limits">
            <Table
              head={["Endpoint", "Limit"]}
              rows={[
                ["POST /api/v1/preflight", "30 requests per minute per IP"],
                ["GET /api/v1/track", "60 requests per minute per IP"],
                ["/check page", "30 loads per minute per IP"],
              ]}
            />
            <p className="mt-4 text-muted">
              Over the limit you get <code className="font-mono text-sm text-ink">429</code> with <code className="font-mono text-sm text-ink">Retry-After</code> in seconds. Limits are
              shared across instances when Upstash Redis is configured, otherwise kept per server instance.
            </p>
          </Section>

          <Section id="cors" title="CORS">
            <p className="text-muted">
              Server-to-server calls need nothing. Browsers on other sites are allowed only for exact origins listed in <code className="font-mono text-sm text-ink">NEER_CORS_ORIGINS</code>{" "}
              (comma-separated). Allowed origins get <code className="font-mono text-sm text-ink">Access-Control-Allow-Origin</code>, methods for that endpoint, the{" "}
              <code className="font-mono text-sm text-ink">content-type</code> header, exposed <code className="font-mono text-sm text-ink">X-Request-Id</code> and{" "}
              <code className="font-mono text-sm text-ink">Retry-After</code>, and a 10-minute preflight cache.
            </p>
            <CodeBlock className="mt-4" code={"NEER_CORS_ORIGINS=https://wallet.example,https://app.example"} title=".env" />
          </Section>

          <Section id="widget" title="<NeerGuard/> React widget">
            <p className="text-muted">
              Keeps your Send button disabled until Neer says Safe to send for exactly the current inputs, less than 60 seconds ago. Loading, errors, non-2xx responses, malformed bodies,
              stale results, Check this and Don&apos;t send all keep it disabled. It never touches a wallet. It lives in this repo as{" "}
              <code className="font-mono text-sm text-ink">packages/react</code> (<code className="font-mono text-sm text-ink">@neer/react</code>); it isn&apos;t on npm yet. Add your
              site to <code className="font-mono text-sm text-ink">NEER_CORS_ORIGINS</code>.
            </p>
            <div className="mt-4 space-y-3">
              <CodeBlock code={WIDGET} title="send-button.tsx" />
              <CodeBlock code={HOOK} title="Hook" />
            </div>
          </Section>

          <Section id="try" title="Try it" lede="These call this deployment's real API from your browser and count toward your rate limit. Nothing is sent on-chain.">
            <div className="space-y-10">
              <TryPreflight initialBody={JSON.stringify(SAFE_REQUEST, null, 2)} />
              <TryTrack initialAddress={EXAMPLE_ADDRESS} />
            </div>
            <p className="mt-6 text-sm text-muted">
              The example quote has expired, so it now returns Don&apos;t send. Paste a fresh deposit address from your swap app to see a live result. 1Click reference:{" "}
              <ExternalLink href="https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api">1Click API docs</ExternalLink>.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}

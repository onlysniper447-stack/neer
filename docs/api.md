# Verification API (unreleased; not deployed to production)

The existing `/v1/*` rewrite also exposes `/v1/verify` as an alias of the same endpoint and quota.

`POST /api/v1/verify` calls the shared `@neer/verify` module. No API key, wallet connection, signature request or transaction submission is involved. Runtime: Node >=22.12.0.

A pass means the deposit details match the quote and the quote has not expired. It does not guarantee delivery, does not verify the counterparty, and cannot recover funds sent to the wrong address.

See [limits and trust boundaries](limits.md), [all finding messages](findings.md), [version policy](versioning.md) and [synthetic fixture coverage](../fixtures/quotes/README.md).

See [checker deep-link behavior](deep-links.md) for the separate legacy lookup and strict automatic-verification URL modes.

## Input

Send `Content-Type: application/json`. The streamed body is limited to 64 KiB. The strict schema rejects every unknown field, including deferred `quoteId`, raw `quote`, rules, verification keys and `tx`.

| Field | Meaning |
|---|---|
| `depositAddress` | Pasted deposit address, not a URL; trimmed length 3–128. |
| `network` | Canonical selected sending network ID, e.g. `eth`. |
| `token` | Canonical catalog asset ID, not a symbol/contract shorthand. |
| `amount` | Human-readable decimal string, not base units. Token decimals are resolved from metadata; precision is not guessed. Trimmed length 1–256; existing grouped commas are accepted. |
| `memo?` | Declared send memo. Omission inherits lookup context; null means no send memo. Printable non-space ASCII, at most 128 characters. |
| `lookupMemo?` | Separate quote lookup memo. Defaults to `memo ?? null`; same memo bounds. |
| `source?` | `wallet`, `exchange` or `unknown`. Omission remains unknown and produces a warning, never an assumed pass. |
| `transfer?` | Strict optional `{ chainId?, from?, to? }` context: positive safe-integer EVM chain ID and declared sender/destination strings of length 1–128. Not proof of ownership or an actual wallet operation. |

Raw draft decoding remains in the existing legacy compatibility flow, not this public contract. Fields inside `transfer` are also strict. Invalid decimal precision or oversized converted base-unit amounts produce validation errors after metadata lookup.

## curl

This is an explicitly fake address/token, not a live quote. Never send funds to it. Replace values only in your own private request with details from a genuine quote; do not commit those details. The local server must already be running. A fake fixture server is used only for local tests.

```sh
curl -i http://localhost:3510/api/v1/verify \
  -H 'Content-Type: application/json' \
  --data '{"depositAddress":"0xfafafafafafafafafafafafafafafafafafafafa","network":"eth","token":"nep141:fake-usdc.omft.near","amount":"5","source":"wallet"}'
```

## fetch

```ts
const response = await fetch("http://localhost:3510/api/v1/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    depositAddress: "0xfafafafafafafafafafafafafafafafafafafafa", // fake
    network: "eth",
    token: "nep141:fake-usdc.omft.near", // fake
    amount: "5", // human units
    source: "wallet",
  }),
});
if (!response.ok) throw new Error(`Verification HTTP ${response.status}`);
const result = await response.json();
if (result.status !== "pass") {
  // Do not send automatically. Review each finding; warn is not pass.
}
```

Neither example invents a successful quote or performs a transfer. Explicit `source: "wallet"` avoids the omitted-source warning; it does not itself make a check pass. Exchange context can produce warnings.

## Results and HTTP behavior

A successful response has exactly `{ status, findings, quote, checkedAt, version }`. Status is `pass`, `warn` or `block`: any block wins, otherwise any warn wins, otherwise pass. Findings are `{ code, severity, message, fix }`, with block/warn severities. Existing unknown checks project to warn. All 69 codes and every schema are in [openapi.yaml](../openapi.yaml).

The quote summary is allowlisted to `{ verified, network, token, amount, minimumAmount, expiresAt, swapType }` and is null without a verified quote. It omits raw quotes, signatures, addresses, memos and internal facts. **Finding messages can contain a quoted memo or shortened address**; do not log them as if they were non-sensitive.

| HTTP | Meaning |
|---|---|
| 200 | Verification result, including business block/warn. An upstream quote failure is **200 + block + `QUOTE_UNAVAILABLE` + null quote**, never pass. This keeps a completed safety decision distinct from HTTP/validation errors. |
| 400 | `{ error: "invalid_input", details: [{ path, message }] }`; at most 20 controlled issues, with no submitted value or arbitrary unknown key echoed. Includes malformed/oversized/non-JSON bodies and precision errors. |
| 405 | `{ error: "method_not_allowed" }`, `Allow: POST, OPTIONS`; HEAD has no body. |
| 429 | `{ error: "rate_limited" }`, with positive integer `Retry-After` seconds. |
| 500 | `{ error: "internal_error" }` for an unexpected application failure; no raw exception details. |
| 204 | OPTIONS CORS preflight only, with an empty body. |

Every application-controlled response has `X-Neer-Verify-Version: 1.0.0`, `Cache-Control: no-store`, the existing API security headers and wildcard CORS. HTTP success does not imply status pass. Recheck near the time of sending; the module cannot prove the later wallet action matches declared input, independently confirm delivery/finality or recover funds.

## Scoped Node transport

Only this endpoint uses Next’s Node API adapter (`pages/api/v1/verify.ts`, with `bodyParser: false`). The same verification module, schema, upstream client, rate bucket and sanitized logger are reused. Every non-POST method delivered to the adapter returns 405 except OPTIONS/204, including TRACE; the guard runs before reading headers or constructing a body stream. No Fetch `Request` is constructed. Legacy server interfaces keep their original React `server-only` markers; the Node API reaches shared Node-safe implementations instead, with a Node built-in/runtime boundary that rejects browser bundling. Upstream clients, caches and rate-limit logic are not duplicated, and no global marker alias is introduced. This avoids the App Router’s earlier pre-handler TRACE constructor failure without a custom server or global CSP change.

The bounded shared JSON reader still enforces 64 KiB. Its demand-only Node stream bridge leaves the request socket intact when cancelling an oversized body, allowing the controlled 400 response instead of a connection reset. No full body is eagerly buffered by Next. Page nonce handling is unchanged; only the exact `/v1/verify` alias is excluded from that page proxy, as `/api/*` already was.

Protocol/parser failures and special connection-level events can occur before an API handler exists. Their status, headers or connection closure are infrastructure behavior, not controlled verification responses. This does not relax the 405/204/version/CORS contract for ordinary unsupported HTTP methods that reach this API, and is not a universal guarantee about malformed wire requests or tunnel/upgrade protocols. Exact locally observed boundaries are recorded in the gate report; no custom server or tunnel handling is added.

## Rate limiting and CORS

Only this endpoint enables `Access-Control-Allow-Origin: *`; no credential header is enabled. Allowed methods are `POST, OPTIONS`, allowed request header is `Content-Type`, and exposed response headers are `X-Neer-Verify-Version, Retry-After`. This does not loosen page CSP/nonces or other APIs' CORS policies. Non-POST methods return 405 except the approved OPTIONS/204 preflight.

POSTs, including invalid ones, consume a distinct `verify` bucket: **60 requests per rolling 60 seconds per proxy-derived IP**. OPTIONS and rejected methods do not consume that quota or contact the upstream. Existing preflight/tracker/page quotas are unchanged. The existing Upstash shared sliding-window backend is used when configured; otherwise the bounded, per-instance memory fallback is used. Redis failures also fall back to instance memory, so shared enforcement requires a healthy shared store and follows that backend’s sliding-window semantics. Memory state is not durable and can reset/evict. IP extraction trusts deployment proxy headers; direct/untrusted proxy deployments need appropriate header sanitization.

## Logs and privacy

Application verification logs contain only `{ timestamp, status, findingCodes, version }`. They never include addresses, amounts, memos, quote IDs, bodies, human finding messages, IPs, request IDs or exception text. Even unexpected exceptions use a generic 500 and the same safe record. Logging failures do not expose raw exceptions.

This is not a promise about hosting access logs, automatic Next.js development request lines, reverse-proxy logs or upstream provider logs, which application logging cannot control. Keep sensitive values out of URLs and your own logs. Requests still send address/lookup memo to the existing quote provider; token metadata uses existing caches. Raw IPs are used as rate-limit keys and sent to Upstash when configured, otherwise held in instance memory. Existing privacy/cache limitations are unchanged; see the product's existing [privacy page](../apps/web/app/%28product%29/privacy/page.tsx). No production settings or integrations are changed by this local endpoint.

## Contract lint

No license is selected by this phase. The strict lint configuration disables the license-presence rule pending the later human license decision. A single JSON-pointer-scoped advisory exception allows OPTIONS to have only its truthful approved 204 response, rather than inventing a 4xx response; POST error-response checks remain enabled.

```sh
pnpm --package=@redocly/cli@2.76.0 dlx redocly lint openapi.yaml
```

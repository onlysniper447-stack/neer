# Verification limits

The verifier contract is 1.0.0. The new API is local and unreleased; this document does not announce a live endpoint. See [API behavior](api.md), [findings](findings.md) and [versioning](versioning.md).

A pass is not a guarantee. Neer cannot recover funds after a transfer is sent. A result describes the supplied details and available data at `checkedAt`, not a later wallet action.

## What is checked

- A non-preview quote's Ed25519 signature against the configured trusted quote key and the existing signed-field canonicalization. A missing/unverified quote cannot produce pass.
- Source-reported deposit lifecycle: pending versus already seen, processing, incomplete, completed, refunded or failed. Status is a separate upstream report, not independent chain evidence.
- The earlier request/quote deadline, a network confirmation-time budget, near-expiry window and reported address inactivity. Timing estimates are not settlement guarantees.
- Pasted and optional declared destination against the quote's deposit address, including lookalikes, supported network-specific format/checksum rules and lowercase EVM fallback comparison.
- Selected network/optional EVM chain ID and selected token against quote-origin metadata: canonical asset ID, network, symbol and available contract. Shared symbols do not prove token identity.
- Required memo and declared memo equality, with separate lookup memo context. Memo mode without a supplied quote memo warns; it is not treated as a completed check.
- Human decimal amount converted using catalog decimals into exact integer base units; quote amount/minimum comparison for supported swap types, precision mismatches and refund-fee risk. No floating-point amount arithmetic.
- Dated published minimum rules where the deposit/recipient modes permit them; unknown USD/network or stale rules warn. The current rule snapshot is `2026.11.2`, not the verifier version. Minimums become stale after 14 days without review; their sources were last re-checked on 2026-11-10, so they are treated as unknown from 2026-11-24. No listed restriction is not proof of every provider limit.
- Supported XRP address/tag constraints, refund address format, refund-to-deposit risk and optional declared-sender comparison; confidential/unsupported funding modes, exchange-source risk and available status/price freshness.

Internal unknown checks become public warn, not pass. Any block wins; otherwise any warn wins. Source omission remains unknown and warns. Quote fetch failure is HTTP 200 with block/QUOTE_UNAVAILABLE, not a successful verification. Syntax/schema/precision errors are HTTP 400, not findings.

## What is not checked

Neer does not establish counterparty identity/trustworthiness, recipient or refund-address ownership/control, token contract legitimacy or safety, solver honesty/behavior, exchange withdrawals/fees, liquidity, gas availability, execution ordering, chain reorgs or transaction inclusion/finality. It does not independently confirm funds arrival, refund delivery or recovery. It cannot ensure your actual wallet destination/network/amount matches the declaration after the result was produced.

Network incident reports are not fetched by the existing checker without partner access; the legacy informational reminder is not a public warning code. Price timestamps and USD values do not authenticate a market price. No live on-chain token/security audit, simulation or wallet inspection is performed.

Neer does not request a seed phrase, connect a wallet, request wallet signatures or submit transfers. Never paste a secret into any field. Parsing arbitrary text is not a promise that accidental secrets could never reach an upstream provider or hosting logs.

## Signature and upstream trust

The quote signature authenticates only the fields assembled by [quoteMessage](../packages/core/src/signature.ts), not every response property. That includes its selected request/quote fields and timestamp. Status, token catalog/decimals/prices, correlation IDs and fields outside that signed payload are not authenticated by that signature. In particular, depositMode/confidentiality are not added to the signature payload by this implementation. Schema validation is not cryptographic authentication. The trusted key, provider availability/data accuracy and existing SDK-derived canonicalization remain dependencies; a signature does not prove honest execution or current status.

The public body cannot provide a raw quote, trusted key, rules, draft transaction or deferred `quoteId`. Internal dependency injection/legacy partner quote comparison are separate trusted compatibility paths, not a way for a public caller to choose trust. Tests use an explicitly fake key. The web test override is restricted to a loopback upstream and is not a new provider integration.

The existing OneClick client uses an 8-second request timeout, bounded response reading and rejects redirects. It does not retry requests automatically. The web transport pins the normal upstream; caller deposit strings are not fetched as arbitrary URLs. These controls do not remove denial-of-service risk or guarantee availability.

## Legacy compatibility versus public input

The public input requires network, canonical token asset ID and human amount, with optional source, memo, lookupMemo and `transfer: { chainId?, from?, to? }`. `quoteId` is deferred and rejected. A declared address is not proof of ownership. See [API schema](api.md).

The separate internal compatibility path retains the original richer checks, actions, receipts, freshness and rules. It can compare a partner quote and decode existing unsigned EVM drafts. The public API cannot accept drafts or partner quotes. Some documented codes therefore require legacy context or defense-in-depth injection rather than a valid public request; [fixtures](../fixtures/quotes/README.md) distinguish them. This work does not change `/check` messages or behavior.

## Storage and privacy boundaries

Verification/preflight reads status without tracker deduplication. The tracker has a per-instance address-and-memo-keyed cache: a 5-second reuse window and at most 5,000 entries. Pruning happens on later cache reads or capacity pressure; the reuse window is **not a guaranteed deletion deadline**. Returned quote/status data can remain in memory. The token cache refreshes after 5 minutes and may serve cached metadata on error for less than 1 hour. No durable deposit-address database is implemented by these paths; this is not a claim that addresses are never held server-side.

Existing browser localStorage statistics contain verdict counts, network IDs and first/latest check times, plus a separate theme preference. They do not store deposit addresses, memos, amounts or quotes. Existing address/memo URLs can remain in browser history, shared links, hosting/proxy and upstream logs. The new POST API is not a reason to put sensitive values in a URL. See the [product privacy source](../apps/web/app/%28product%29/privacy/page.tsx).

The API's application logger writes only timestamp, HTTP status, allowlisted finding codes and verifier version. Human finding messages may contain memos/shortened addresses; do not log them as non-sensitive text. Application logging cannot control automatic framework, hosting, proxy or upstream logs. Lookup sends address/lookup memo to the existing provider. No promise of complete IP/address non-storage or guaranteed deletion is made.

## Rate limiting, CORS and parser boundaries

Verify has a distinct 60-POST-per-60-second, per-proxy-derived-IP bucket. Invalid POSTs count; rejected methods and OPTIONS do not. Raw IP keys reach Upstash when configured. Without it, or on Redis failure, a bounded per-instance memory limiter applies. Memory resets/eviction and multiple instances prevent a distributed enforcement guarantee; proxy header trust requires deployment-level sanitization. No new account/store/settings were provisioned.

Wildcard CORS permits browser reads of this endpoint without credentials; it does not authenticate callers or authorize wallet actions. Existing other APIs and page CSP/nonces remain unchanged. Application-controlled responses include version/CORS/security headers: non-POST methods routed to the adapter, including TRACE, return 405 except approved OPTIONS/204. Local probes observed CONNECT closing before routing and unknown/malformed request lines receiving parser-level 400 without application headers. Parser/connection failures are outside this handler; there is no universal raw-wire header/status guarantee and no tunnel/custom-server handling.

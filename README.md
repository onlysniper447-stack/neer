# Neer

Check a NEAR Intents (1Click) deposit **before** you send.

Paste the deposit address from your swap app, say how you'll send (network,
token, amount, wallet or exchange) and Neer compares that with the quote 1Click
signed for that address. You get one of three answers, **Safe to send**,
**Check this** or **Don't send**, with the reason and a fix. After you
send, the tracker follows the deposit until it's delivered or refunded.

Neer only reads public 1Click data. It never asks for a seed phrase, never
connects a wallet, never signs and never sends anything.

> "Safe to send" means your transfer matches a quote signed by NEAR Intents.
> It is a check, not a guarantee.

## Run it

Requires Node ≥ 22.12 and pnpm 10.

```bash
pnpm install
pnpm build            # all packages + the Next.js app
pnpm test             # unit tests: core, oneclick client, web server code, React widget
pnpm lint
pnpm typecheck

pnpm dev              # http://localhost:3000 (talks to the real 1Click API)

# Playwright e2e: builds the app, runs it against a local mock of 1Click
pnpm e2e
pnpm --filter @neer/web screenshots   # writes ./screenshots/v2/*.png (mobile + desktop, light + dark)

# Live smoke test against the real 1Click API. Requests ONE fresh non-dry
# quote for 5 USDC (Arbitrum -> Solana), verifies its signature, reads its
# status and runs the engine on it. No funds are sent; the address expires.
SMOKE_OUT=$PWD/.smoke-address pnpm smoke   # absolute path: the script runs in packages/oneclick
# Then drive the real app through that address and save live screenshots:
pnpm --filter @neer/web build
pnpm --filter @neer/web exec next start --port 3200 --hostname 127.0.0.1 &
NEER_URL=http://127.0.0.1:3200 LIVE_ADDRESS=$(cat .smoke-address) pnpm --filter @neer/web live
```

Playwright needs Chromium once: `pnpm --filter @neer/web exec playwright install chromium`.

Environment variables are all optional; see `apps/web/.env.example`.

## Web app

Every page has the same header: a three-bar menu button top left, the Neer
logo next to it and the theme toggle (system, light, dark) on the right. The
menu is a left drawer on every screen size (Radix Dialog via the shadcn Sheet:
focus trap, Esc closes, focus returns to the button) with four sections:

| Section | Path | What's there |
| --- | --- | --- |
| Tools | `/tools` | The three working tools. Deposit preflight (`/` then `/check`), swap tracker (`/track`, paste an address, then `/track?address=…`), address checker (`/tools/address`: networks an address is valid on, checksum, canonical form, lookalike compare; runs in the browser with `@neer/core`). Unbuilt tools are listed as "Coming later" and aren't links. |
| Analytics | `/analytics` | Live network and token counts from 1Click `/v0/tokens` (server cache, 5 min), every network with its token count, whether Neer validates its addresses, its minimum and confirm budget; the minimums Neer enforces with their sources; the rules catalog with severities. Optional local-only counts of this browser's checks (localStorage, verdicts and networks only, with a Clear button). No invented numbers: if 1Click doesn't answer, the page says so. |
| API | `/developers` | Docs for `POST /api/v1/preflight` and `GET /api/v1/track` with real responses captured from the live API (`apps/web/lib/docs/examples`, kept in sync by a unit test), error codes, rate limits, CORS, `<NeerGuard/>`, copy buttons and a try-it form that calls this deployment. |
| Resources | `/resources` | How Neer works, the three answers, every check and status in plain English, safety tips, FAQ, and links to the NEAR Intents docs, explorer, NEAR support and terms, and near/intents#382. |

Layouts are mobile-first (checked at 360 px) and use two columns from 1024 px:
on `/check` the verdict and checks sit beside the countdown, deposit address and
quote details; the tracker does the same. Loading states are skeletons shaped
like the page. Motion is limited to short fades and the drawer slide, and is
switched off with `prefers-reduced-motion`.

## Layout

```
packages/core       @neer/core      Pure TS rules engine. No I/O. zod schemas for every
                                    1Click shape, address validation per chain, quote
                                    signature verification, 17 checks, verdict aggregation,
                                    status copy and tracker timeline.
packages/oneclick   @neer/oneclick  Read-only 1Click client (status, tokens; quote only for
                                    the smoke script). Every response is validated; failures
                                    are typed (not_found, rate_limited, timeout, ...).
packages/react      @neer/react     <NeerGuard/> and useNeerPreflight(): keep a Send button
                                    disabled until a fresh "safe" verdict for those exact inputs.
apps/web            @neer/web       Next.js App Router app + /api/v1 (preflight, track).
fixtures            @neer/fixtures  Recorded live 1Click responses + scenario builders signed
                                    with a test key (tests and the e2e mock only).
```

### How a check runs

1. `/check?address=…[&memo=…]` (server) validates the paste, looks up
   `GET /v0/status` and `GET /v0/tokens`, verifies the quote's Ed25519
   signature and runs the checks that don't depend on your send. If one of them
   already blocks (expired, used, forged, unknown), you get **Don't send**
   immediately.
2. Otherwise you say how you'll send. Nothing is pre-selected.
3. The browser POSTs to `/api/v1/preflight`. The server reads 1Click again
   (never cached) and runs all 17 checks.
4. The verdict is **fail-closed**: any `block` gives Don't send; any `warn` or
   `unknown` gives Check this; Safe needs every required check
   (signature, used, time, lookalike, network, token, amount, exchange) to pass.
   1Click errors, timeouts or a missing token list can never produce Safe.

### Quote signatures

1Click signs each quote with Ed25519. Neer rebuilds the signed message exactly
like the official `@defuse-protocol/one-click-sdk-typescript` (0.1.26):
`base58(sha256(stableStringify({...signed request fields, ...signed quote fields, timestamp})))`,
verified against `ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc`. Tests
check parity with the SDK's message and with `json-stable-stringify`, using real
recorded quotes. Any field changed after signing (deposit address, amount,
deadline, refund address…) fails the check and blocks.

## The checks

| id | Title | Blocks when | Otherwise |
| --- | --- | --- | --- |
| signature | Quote | signature missing or invalid | pass |
| used | Address status | status is not PENDING_DEPOSIT | pass |
| time | Time left | expired, or less time left than the origin chain's confirm budget | warn when close (< max(2× budget, 10 min)) |
| lookalike | Address match | pasted / send-screen address differs from the signed one, or only the start and end match (poisoning) | lowercase EVM paste that matches the checksummed address passes |
| network | Network | chosen network or wallet chain ID isn't the quote's origin chain | pass |
| format | Address format | deposit address isn't valid for the origin chain | unknown for chains Neer can't validate |
| token | Token | a different token, or an unknown contract on the right chain | warn for a same-symbol, different-contract token |
| memo | Memo | memo required but missing or different | pass / not needed |
| amount | Amount | less than the quote needs (EXACT_INPUT / FLEX_INPUT / EXACT_OUTPUT rules) | warn when sending more than the quote (the extra goes back to the refund address); unknown when comparing different tokens |
| minimum | Network minimum | under 1Click's current $1,000 minimum on BSC, Polygon, TON, Optimism, Avalanche, Stellar, Monad, X Layer, ADI (origin or destination) or $100 from Tron | unknown when the minimums config is older than 14 days |
| xrp | XRP tag | refund/recipient uses an XRP destination tag | warn for X-addresses |
| refund | Refund to | refund address invalid for its chain, or equal to the deposit address | info for Intents refunds; pass when it matches your address |
| approval | Transfer type | a draft tx is an approval or another contract call | warn for dust at or under the refund fee |
| confidential | Confidential swap | — | warn: Neer doesn't check confidential swaps |
| exchange | Sending from | — | warn for exchanges (fees, slow refunds); unknown if not chosen |
| stale | Freshness | — | warn when the status read is > 60 s old or prices > 15 min old |
| incident | Network incidents | — | info: needs a partner key, not checked |

Every message is plain English and says what to do (`packages/core/src/checks.ts`).
Rules config (minimums, budgets) is versioned in `packages/core/src/rules-config.ts`
(`2026.10.0`); each response carries `rulesVersion` and a `checksHash`.

## API

`POST /api/v1/preflight` (alias `/v1/preflight`)

```json
{
  "deposit":  { "address": "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39", "memo": null },
  "transfer": { "chain": "base", "asset": "native", "amount": "170000000000000000", "source": "wallet",
                "chainId": 8453, "from": "0x…", "to": "0x…", "memo": null,
                "tx": { "to": "0x…", "data": "0x…", "value": "0x…" } }
}
```

`amount` is in base units. `asset` is `native`, a token contract or a 1Click
`assetId`. Only `chain`, `asset` and `amount` are required.

Responses: `200` with `{ verdict, label, headline, message, checks[], quote,
signedQuote, rulesVersion, checksHash, serverTime, requestId }`; `404` (quote not
found, verdict block); `503` (1Click unavailable, never safe); `422` (unknown
network, or quote signature didn't verify); `400` (invalid body, with
`issues[]`); `429` (rate limited, `Retry-After`). Error bodies carry
`error.code` (`NEER_*`).

`GET /api/v1/track?address=…[&memo=…]` returns the status with plain-English
label and message, timeline steps, deposited / refunded amounts, origin and
destination transactions (only `https:` explorer links), the quote summary and
the signed quote.

Every API response is `Cache-Control: no-store` with an `X-Request-Id`.
Browser calls from other sites are allowed only for origins in
`NEER_CORS_ORIGINS`.

### `<NeerGuard/>`

```tsx
import { NeerGuard, NeerStatus } from "@neer/react";

<NeerGuard endpoint="https://your-neer-deployment" deposit={{ address }} transfer={{ chain: "eth", asset: "native", amount, source: "wallet" }}>
  {(guard) => (
    <>
      <button disabled={!guard.canSend}>Send</button>
      <NeerStatus guard={guard} />
    </>
  )}
</NeerGuard>
```

`canSend` is true only for a `safe` verdict on exactly the current inputs, less
than `maxAgeMs` (60 s) old. Loading, errors, non-2xx, malformed bodies, stale
results, `check` and `block` keep it false.

## Security

- CSP with a per-request nonce (`proxy.ts`), `strict-dynamic`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`. API responses use
  `default-src 'none'`.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin`,
  Permissions-Policy, COOP.
- All input is parsed with zod; pasted addresses with spaces, zero-width or
  look-alike Unicode characters, or links are refused, not "cleaned".
- Server-side only calls to 1Click with an 8 s timeout. The upstream host is
  fixed; the test override only accepts loopback URLs, and disabling rate
  limits only works together with it.
- Rate limits: preflight 30/min, track 60/min, check page 30/min per IP
  (Upstash when configured, otherwise in-memory).
- The tracker shares one 1Click status read per address per 5 s; preflight
  always reads fresh.
- ESLint forbids wallet signing / sending RPC method names anywhere in the code.

## Tests

| Package | Runner | Count |
| --- | --- | --- |
| @neer/core | vitest | 123 |
| @neer/oneclick | vitest | 11 |
| @neer/web (server code, inputs, rate limiter, address checker, analytics, local stats, docs examples) | vitest | 49 |
| @neer/react | vitest + Testing Library (jsdom) | 4 |
| @neer/web e2e | Playwright, desktop Chrome | 71 |
| @neer/web e2e | Playwright, Pixel 7 (paste flow, menu, pages) | 58 |
| screenshots | Playwright (56 images in `screenshots/v2`) | 16 |

The e2e suite runs the production build against `apps/web/e2e/mock-1click.ts`,
which serves the recorded token list and `/v0/status` bodies shaped like the
recorded live responses, signed with a test key. Scenarios: safe, #382 replay
(ETH on Base to an Ethereum quote) and its fix, too little, exchange, near
expiry, expired, used, not found, 1Click down, Stellar memo right / missing,
bad input, tracker progression to delivered (and polling stops), API contract,
CORS, security headers, and the landing page's curl example.

The menu and page suites (`e2e/nav.spec.ts`, `e2e/pages.spec.ts`) open and
close the menu by click, Esc and keyboard (focus trap and focus return), load
every page with no console errors and a CSP nonce, check there's no horizontal
scroll at 360 px, and run axe (`@axe-core/playwright`, WCAG 2.2 AA + best
practice) in light and dark on every page, the three verdicts and the open
menu; serious and critical violations fail the test.

## Limitations (honest list)

- **#382 replay is reconstructed.** The real address now 404s on 1Click. The
  fixture uses the address, amount and correlation ID from the issue; refund
  address, destination and deadlines are assumptions.
- **The Stellar memo quote isn't recorded live.** Non-dry MEMO quotes failed
  on 1Click ("Failed to get quote") during the build, so that fixture follows
  the OpenAPI shape. The mock assumes a MEMO quote is only found with its memo.
- **No on-chain reads.** Neer doesn't read balances, contract code or wallet
  history, so it can't detect address-poisoning entries in your history or
  that a token contract is fake beyond the 1Click token list.
- **Network incidents aren't checked** (needs a 1Click partner key).
- **Approval checks** need a draft `tx` (API / widget). The web form can't see
  what your wallet will really send, so it says so.
- **Network minimums** come from 1Click's announced limits, hard-coded with a
  date. They are treated as unknown once older than 14 days.
- **Rate limiting** without Upstash is per server instance. The client IP is
  read from `X-Forwarded-For`, which is only trustworthy behind a proxy that
  sets it (Vercel does).
- `style-src` allows `'unsafe-inline'` for inline style attributes (countdown bar width, Radix). Scripts stay nonce-only.
- Not built from the spec: attestations (signed Neer verdicts / JWS),
  API keys and site keys, refund helper, history, partner
  dashboard, AI explanations, confidential swaps.

## 1Click API notes found while building

- `/v0/status` returns `quoteResponse` **without** `correlationId`, although
  the OpenAPI marks it required; many `swapDetails` fields are `null`.
- `/v0/status` is case-insensitive for EVM addresses; an empty address is a 400;
  unknown addresses are a 404 with a JSON message.
- `/v0/tokens` includes chains not in the OpenAPI enum (`abs`, `qtc`). The
  Arbitrum USDT symbol is `USDT0`.
- A quote has two deadlines: `quoteRequest.deadline` (~30 min, refunds start)
  and `quote.deadline` (~3 days). Neer uses the earlier one for "Send before".
- `POST /v0/quote` works without a JWT. 1Click enforces the $1,000 minimum
  at quote time ("Temporary swap limits: minimum swap amount is $1,000") also
  when BSC is the **destination**. A dry quote with `depositMode: MEMO` on a
  non-memo chain fails with "Incorrect depositMode".
- Dry quotes are signed over the amount fields only (no deposit address), as
  in the SDK.

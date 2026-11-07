# @neer/verify (unpublished)

Pure async verification for **Node >=22.12.0**, following the workspace package convention. No React, Next, browser globals, wallet access, signing or transaction submission. Nothing is published. The web app now has an HTTP adapter that has not been deployed to production; see [API documentation](../../docs/api.md).

`verifyDeposit(input, deps?)` reuses `@neer/core` and `@neer/oneclick`. `deps.fetchQuote({ depositAddress, lookupMemo })` returns `{ lookup, tokens }`: the validated signed status quote, its retrieval time and token metadata, not just an unsigned quote summary. The default adapter composes the existing client's `getStatus` and `getTokens`; it implements no HTTP protocol. `now`, rules and a test public-key dependency can be injected by trusted callers, never through public input.

## Public input

- `depositAddress`: pasted address.
- `network`: canonical network ID, e.g. `eth`, not a display name.
- `token`: canonical `nep141:`, `nep245:` or `1cs_v1:` asset ID, not a symbol/contract shorthand.
- `amount`: **human-readable decimal string**, parsed with the selected token's catalog decimals using BigInt. Proper comma thousands groups follow the existing parser. No float conversion. Unknown metadata stays unknown; precision is not guessed.
- `memo?`: declared transfer memo. Omission inherits the lookup memo, matching legacy behavior; explicit null means no memo.
- `lookupMemo?`: separate quote-lookup memo; if omitted, defaults to `memo ?? null`.
- `source?`: wallet/exchange/unknown. Omitted source remains unknown and yields warn, never pass.
- `transfer?`: supplemental `{ chainId?, from?, to? }` context. Sender/recipient are declarations, not proof of ownership or an actual wallet operation.

Unknown fields, including deferred `quoteId`, are rejected by `VerifyInputSchema`. Draft `tx` remains supported by the **full legacy compatibility path**, not the new public input: it otherwise supersedes the declared fields and changes this public contract's meaning. Unknown keys are also rejected inside public transfer context. Input errors throw `VerifyInputError` with bounded path/message issues, not raw values.

## Public output

Exactly `{ status, findings, quote, checkedAt, version }`. `VERIFY_VERSION` is the single constant `1.0.0`; package and rules versions retain their separate meanings.

Findings contain only `{ code, severity, message, fix }`. Stable branch identities are attached inside the existing engine, not recovered from human text. Pass/info rows stay in the legacy result; unknown adverse checks project to warn, never disappear into pass. Quote unavailability explicitly projects to block. Missing required checks and unidentified adverse checks cannot become pass. `FINDING_CODES` enumerates the 69 actionable Phase 0 branch identities, including defensive cases; not every legacy-only branch is reachable through the strict public input.

Quote summary is allowlisted to `{ verified, network, token, amount, minimumAmount, expiresAt, swapType }`; amounts are human-unit strings or null when precision is unknown. Unverified quotes produce null. It deliberately excludes raw quotes/signatures, addresses/memos/refund recipients and internal facts. Existing finding messages themselves may name a quoted memo or shortened address; exact legacy wording is preserved rather than redacted silently.

Any block wins, otherwise any warn wins, otherwise pass. A pass is not a guarantee of delivery, ownership, counterparty or token-contract safety, nor a promise the later wallet action matches these declarations. No funds can be recovered by this module after sending.

## Legacy compatibility

`verifyLegacyPreflight(PreflightInput)` returns the full, unchanged `PreflightResult`, including five severities, expected/actual facts, actions, timing boundaries and signed receipt material. It is used by both `preflightService` and `loadCheckPage`; the existing UI still posts its original base-unit/source-aware payload to the original preflight route. Existing upstream caches/rate limits/HTTP errors remain in the web layer. Internal reason annotations are held in a WeakMap and are absent from response keys, JSON and hashes.

## Verification

Use the existing pnpm/Vitest/ESLint/TypeScript commands. Tests use explicitly fake, deterministically signed fixtures. One exercised fixture covers each public finding code; defensive and legacy-only branches are tested through the same engine/compatibility projection, not by claiming impossible public input paths. Full template snapshots include pass/info wording. A transitive project import/global guard checks verifier→core→client. Browser coverage is reported separately at Gate 1; test definitions alone are not a pass.

# Verification versioning

This policy describes the **1.1.0 verification contract** (1.0.0 plus the receiving-address check). It does not announce an npm package. See [changelog](../CHANGELOG.md), [API](api.md), [findings](findings.md) and [limits](limits.md).

## Separate version domains

- `VERIFY_VERSION` in [types.ts](../packages/verify/src/types.ts) is the single runtime verification-contract constant, currently `1.1.0`. Results, the version response header, OpenAPI and finding introduced versions must agree with the relevant contract release.
- The URL namespace `/api/v1/verify` (also `/v1/verify`) identifies the API major version. Minor/patch contract versions keep that namespace. A breaking API major requires an explicitly reviewed new namespace and migration plan, not a silent change to v1.
- Workspace package manifests were bumped semver-minor for 1.1.0: `@neer/core`, `@neer/verify` and `@neer/react` from `0.1.0` to `0.2.0`, `@neer/mcp-verify` from `1.0.0` to `1.1.0`. None of them is published to npm.
- `DEFAULT_RULES.version` is currently `2026.11.2` (minimums re-checked 2026-11-10; the previous snapshot was `2026.11.1`). This dated rule snapshot and its `checkedAt` freshness metadata are distinct from semantic contract versions and quote deadlines. A rule refresh does not extend a quote's validity. No result exposes the full internal rule/receipt object through the public projection.

## Semantic version rules

- **Major:** breaking input/output changes, units or token identity semantics, removal of supported input behavior, new required input, or intentional incompatible severity/decision policy. Do not silently reinterpret human amounts as base units. Preserve existing namespaces until a human-approved migration.
- **Minor:** additive supported checks/new finding codes or optional input capabilities that do not break the existing contract. New findings can change a previously pass result to warn/block; clients must handle new codes conservatively, not auto-send on an unknown code. Document these safety effects before release.
- **Patch:** wording/fix guidance, documentation and compatible bug/security corrections. Safety bug corrections may change outcomes and must be described, not hidden. Do not reclassify intentional breaking policy as a patch.

Finding codes are **never renamed or removed**, even in a major version. Retired codes remain reserved/documented with their introduced version. Wording may change in patch releases; consumers branch on `code`, `severity` and result `status`, never exact message text. Tests snapshot current strings to make changes explicit; this baseline changes none. Adding a code requires enum/OpenAPI/reference/fixture alignment and a changelog entry. Application logs use only allowlisted codes, not human messages.

## 1.1.0: receiving-address check

- New optional input `expectedRecipient` (and `expectedDestinationChain`), new required check `recipient`, and seven new finding codes `RECIPIENT_*` (see [findings](findings.md)).
- Safety effect, deliberate: an input that returned `pass` in 1.0.0 now returns `warn` with `RECIPIENT_NOT_PROVIDED` unless `expectedRecipient` is given and matches the quote's recipient. A quote that pays a different address, a lookalike address, or a different destination network now blocks. This is a minor bump under the rule above (an additive check that can turn a previous pass into warn/block); clients must treat the new codes conservatively.
- Machine values are unchanged: verifier `status` stays `pass`/`warn`/`block` and the preflight `verdict` stays `safe`/`check`/`block`. Only the human labels changed: `safe` is now shown as **Checks passed** (headline "Matches a signed NEAR Intents quote and your receiving address."), `check` stays **Check this**, `block` stays **Don't send**.
- Unchanged: validation errors are 400, a fake or unknown deposit address is a 200 block (`QUOTE_NOT_FOUND` in preflight, `QUOTE_UNAVAILABLE`/not-found handling in verify as before), OPTIONS is 204, `quoteId` is rejected with 400, rate limits and security headers are the same. The verifier source manifest records each changed file with a reason.

## Current input and decision contract

Amounts are human-readable decimals parsed with catalog decimals; `token` is a canonical asset ID, not a symbol or arbitrary contract address. Optional context is `source`, `memo`, separate `lookupMemo`, `expectedRecipient`, `expectedDestinationChain`, and strict `transfer: { chainId?, from?, to? }`. Omitted source is unknown and warns. `quoteId` is deferred until lookup semantics are defined, and is rejected today, not silently ignored. Raw quote/key/rules/tx fields are rejected too.

Public output is exactly `{ status, findings, quote, checkedAt, version }`; findings have block/warn severity. Any block wins, otherwise any warn wins, otherwise pass. Internal unknown checks never project to pass. The quote summary is allowlisted or null. Quote failure is HTTP 200 with block/QUOTE_UNAVAILABLE and null quote; validation failure is HTTP 400. Ordinary unsupported routed methods are 405 except OPTIONS/204. Parser-level limits and rate-store fallbacks remain explicit in [limits](limits.md).

The internal legacy compatibility result is intentionally richer and separate. It retains original messages, severities, source/transfer context, actions, receipt and freshness for `/check`; it is not the public JSON schema. No deep-link behavior, wallet operation or later MCP interface is introduced by this phase.

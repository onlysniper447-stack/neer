# Verification versioning

This policy describes the prepared **1.0.0 verification contract**, currently local and unreleased. It does not announce an npm package or endpoint deployment. See [changelog](../CHANGELOG.md), [API](api.md), [findings](findings.md) and [limits](limits.md).

## Separate version domains

- `VERIFY_VERSION` in [types.ts](../packages/verify/src/types.ts) is the single runtime verification-contract constant, currently `1.0.0`. Results, the version response header, OpenAPI and finding introduced versions must agree with the relevant contract release.
- The URL namespace `/api/v1/verify` (also `/v1/verify`) identifies the API major version. Minor/patch contract versions keep that namespace. A breaking API major requires an explicitly reviewed new namespace and migration plan, not a silent change to v1.
- Workspace package manifests currently use `0.1.0`, including `@neer/verify`; they are not evidence that a 1.0.0 npm package was published. A later package release must deliberately synchronize/document its relationship to the contract. No package version is bumped by this documentation phase.
- `DEFAULT_RULES.version` is currently `2026.11.2` (minimums re-checked 2026-11-10; the previous snapshot was `2026.11.1`). This dated rule snapshot and its `checkedAt` freshness metadata are distinct from semantic contract versions and quote deadlines. A rule refresh does not extend a quote's validity. No result exposes the full internal rule/receipt object through the public projection.

## Semantic version rules

- **Major:** breaking input/output changes, units or token identity semantics, removal of supported input behavior, new required input, or intentional incompatible severity/decision policy. Do not silently reinterpret human amounts as base units. Preserve existing namespaces until a human-approved migration.
- **Minor:** additive supported checks/new finding codes or optional input capabilities that do not break the existing contract. New findings can change a previously pass result to warn/block; clients must handle new codes conservatively, not auto-send on an unknown code. Document these safety effects before release.
- **Patch:** wording/fix guidance, documentation and compatible bug/security corrections. Safety bug corrections may change outcomes and must be described, not hidden. Do not reclassify intentional breaking policy as a patch.

Finding codes are **never renamed or removed**, even in a major version. Retired codes remain reserved/documented with their introduced version. Wording may change in patch releases; consumers branch on `code`, `severity` and result `status`, never exact message text. Tests snapshot current strings to make changes explicit; this baseline changes none. Adding a code requires enum/OpenAPI/reference/fixture alignment and a changelog entry. Application logs use only allowlisted codes, not human messages.

## Current input and decision contract

Amounts are human-readable decimals parsed with catalog decimals; `token` is a canonical asset ID, not a symbol or arbitrary contract address. Optional context is `source`, `memo`, separate `lookupMemo`, and strict `transfer: { chainId?, from?, to? }`. Omitted source is unknown and warns. `quoteId` is deferred until lookup semantics are defined, and is rejected today, not silently ignored. Raw quote/key/rules/tx fields are rejected too.

Public output is exactly `{ status, findings, quote, checkedAt, version }`; findings have block/warn severity. Any block wins, otherwise any warn wins, otherwise pass. Internal unknown checks never project to pass. The quote summary is allowlisted or null. Quote failure is HTTP 200 with block/QUOTE_UNAVAILABLE and null quote; validation failure is HTTP 400. Ordinary unsupported routed methods are 405 except OPTIONS/204. Parser-level limits and rate-store fallbacks remain explicit in [limits](limits.md).

The internal legacy compatibility result is intentionally richer and separate. It retains original messages, severities, source/transfer context, actions, receipt and freshness for `/check`; it is not the public JSON schema. No deep-link behavior, wallet operation or later MCP interface is introduced by this phase.

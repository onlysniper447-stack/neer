# Synthetic quote fixtures

**FAKE LOCAL TEST DATA — DO NOT SEND FUNDS.** These are generated examples, not anonymized real users or live provider quotes. They grant no wallet/account access. The new endpoint remains local and unreleased.

Eight JSON quote families contain a signed base quote, token catalog, source/transfer context, rule snapshot and fixed clock, plus 72 scenario overlays covering all **69 public finding codes** in the compatibility/projection harness. Three extra scenarios exercise pasted/send address wording variants and decoded-draft token-contract block severity. All eight base contexts pass at the fixed test clock; they are not valid promises at today's clock.

## Reproduce

Use the repository's pnpm 10.34.9, Vitest and Node >=22.12.0 conventions:

```sh
pnpm --filter @neer/verify test
```

The executable harness is [reference.test.ts](../../packages/verify/test/reference.test.ts). It reads these JSON files directly, replays overlays, hydrates Date values, injects only the specified failure, checks the targeted exact code/severity/message/fix, and compares the separately recorded public replay. It does not fetch the network or operate a wallet. Ordinary pass/block/warn cases and exact legacy-message snapshots remain in the existing tests too.

## Format and trust

- `fixtureKind` is `FAKE_LOCAL_ONLY_DO_NOT_SEND`; schemaVersion is 1 and verifierVersion is 1.0.0.
- `base` is the complete serialized legacy context, including the signed quote, fake token metadata/decimals, source, memo context, rule freshness and clock. Quote/legacy amounts are base-unit strings; `publicReplay.input.amount` uses human decimals.
- `patches` is an object-only JSON-pointer add/remove/replace list relative to base. Arrays are replaced whole; removal matters for omitted inputs. Hydrate only `now` and found `lookup.fetchedAt` as Date objects; quote timestamps stay strings. Signatures are already computed after quote changes, except deliberately invalid-signature tests.
- Clock: **2026-11-07 16:30 WAT (Africa/Lagos)**. Protocol values use ISO UTC for deterministic parsing; no wall-clock/network dependence. The rule checkedAt values are test data, not a newly reviewed production rule source.
- Signing derives from the existing public test-only label `NEER_VERIFY_FAKE_TEST_KEY_DO_NOT_USE_WITH_FUNDS` in [fixtures.ts](../../packages/verify/test/fixtures.ts). JSON contains only the matching test public key/signatures, never a private seed/key. This is not the production quote key. Never use this derivation with funds, install it as a real trust root, or add real keys to fixtures.
- Repeated-byte EVM addresses (fa/ba/da/ca), deterministic checksummed Tron/XRP examples from repeated bytes and `fake-*` accounts/assets/memos are synthetic. Format-valid does not mean owned, safe or fundable; **never send to any fixture address**. No real user address, memo, quote, token credential or private key is included.
- `fault` is null, `throw-first-rule` or `omit-first-rule`; the latter two are defense-in-depth injections with try/finally restoration, not remotely selectable API parameters. The API never accepts fixture keys, raw quote, rules or fault controls.

## Families

| File | Target scenarios | Unique codes |
|---|---|---|
| [01-quote-identity.json](01-quote-identity.json) | 4 | 4 |
| [02-deposit-lifecycle.json](02-deposit-lifecycle.json) | 9 | 9 |
| [03-address-network.json](03-address-network.json) | 17 | 15 |
| [04-token-selection.json](04-token-selection.json) | 7 | 6 |
| [05-memo-amount.json](05-memo-amount.json) | 9 | 9 |
| [06-minimum-xrp.json](06-minimum-xrp.json) | 9 | 9 |
| [07-refund-draft.json](07-refund-draft.json) | 8 | 8 |
| [08-context-defenses.json](08-context-defenses.json) | 9 | 9 |

## Coverage boundaries and gaps

**No missing code fixture in the compatibility/projection harness: 69/69.** A quote alone cannot encode selected inputs, catalog state, clock, lookup failure or a failed/missing rule; the complete contexts and explicit overlays are necessary. There is no claim that 69 different signed quotes alone trigger every code.

The public-module replays produce 59/69 target codes: 57 without a fault injection, plus RULE_EXECUTION_FAILED and REQUIRED_CHECK_MISSING through the explicit harness faults. These are module replays with injected fetch dependencies, not live HTTP/browser or real-transfer evidence. Ten codes remain intentionally legacy-only/defensive rather than falsely represented as reachable with valid public input:

| Code | Why public-input replay cannot produce this target |
|---|---|
| `PARTNER_QUOTE_MISMATCH` | Requires a separately supplied partner quote; public input forbids raw quote. |
| `DEPOSIT_STATUS_UNKNOWN` | Requires a partner quote with missing fetched status; public input has no partner quote fallback. |
| `QUOTE_DEADLINE_MISSING` | Malformed quote bypasses legacy schema defensively; public bundle validation rejects it as unavailable. |
| `NETWORK_NOT_SELECTED` | Legacy selection can be absent; public network is required. |
| `TOKEN_NOT_SELECTED` | Legacy selection can be absent; public canonical token is required. |
| `TOKEN_UNACCEPTED_CONTRACT` | Legacy accepts contract shorthand; public token must be a canonical asset ID. |
| `AMOUNT_MISSING` | Legacy amount can be absent; public human amount is required. |
| `DRAFT_NETWORK_UNSUPPORTED` | Requires legacy unsigned draft context; public tx is rejected. |
| `DRAFT_APPROVAL` | Requires legacy unsigned draft context; public tx is rejected. |
| `DRAFT_NOT_PLAIN_TRANSFER` | Requires legacy unsigned draft context; public tx is rejected. |

TOKEN_CONTRACT_MISMATCH's public replay can reproduce the code with warn, but its decoded-draft block variant belongs only to the legacy harness. RULE_EXECUTION_FAILED and REQUIRED_CHECK_MISSING require implementation-failure injection, not just quote edits. Required-check contradictory-result fallback branches have separate existing boundary tests; this fixture set is code coverage, not a claim of every possible path/value combination.

Do not weaken schema validation to manufacture reachability. Keep these public-path gaps explicit if input support changes later. Every current code still has an executable compatibility fixture and appears in the [exact finding reference](../../docs/findings.md). See [limits](../../docs/limits.md), [API](../../docs/api.md) and [version policy](../../docs/versioning.md).

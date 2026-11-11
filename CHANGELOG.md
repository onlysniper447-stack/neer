# Changelog

All notable changes to the verification contract will be documented here, following Keep a Changelog and semantic versioning. This file starts with the planned **1.0.0** contract, not a claim that it has been released.

## [Unreleased]

Nothing yet.

## [1.1.0] - 2026-11-11

### Added

- Receiving-address check (`recipient`, required for a pass). New optional input `expectedRecipient` (the user's own receiving address) and `expectedDestinationChain`, in the core transfer, `@neer/verify` input, `/api/v1/verify` and `/v1/verify`, `/api/v1/preflight` (`transfer.expectedRecipient`), the MCP tool `verify_near_deposit`, OpenAPI, the `/check` form ("Your receiving address") and deep links (`recipient`, `recipientNetwork`).
- Seven finding codes: `RECIPIENT_CONFIDENTIAL`, `RECIPIENT_NETWORK_MISMATCH`, `RECIPIENT_NETWORK_UNKNOWN`, `RECIPIENT_NOT_PROVIDED`, `RECIPIENT_LOOKALIKE`, `RECIPIENT_MISMATCH`, `RECIPIENT_FORWARDED` (76 public codes in total).
- Fixture family 09-recipient-match; every existing fixture now carries the expected receiving address.

### Changed

- **Safety effect:** a matching send without a receiving address is now `check` / `warn` (`RECIPIENT_NOT_PROVIDED`), not `safe` / `pass`. A different, lookalike or wrong-network recipient blocks.
- Human label for `safe` is now "Checks passed" (was "Safe to send"), with the headline "Matches a signed NEAR Intents quote and your receiving address." and a definition that lists what was and wasn't checked. Machine values `safe`/`check`/`block` and `pass`/`warn`/`block` are unchanged.
- `VERIFY_VERSION` and `X-Neer-Verify-Version` are 1.1.0. Package versions: `@neer/core`, `@neer/verify`, `@neer/react` 0.2.0; `@neer/mcp-verify` 1.1.0 (not published).
- Copied links leave out the receiving address unless the user ticks "Include receiving address in link".

## [1.0.0]

Target verification contract: **1.0.0**. Local and QA-preview work only: no production deployment, npm publication or release date is recorded. Existing workspace package manifests remain 0.1.0.

### Added

- Pure Node >=22.12 verification module with injectable existing quote lookup, stable 69-code public findings, allowlisted quote summary and verifier version 1.0.0.
- Separate internal compatibility path preserving legacy `/check` messages, actions, severities, receipts and freshness.
- Strict local POST `/api/v1/verify` and alias `/v1/verify`, exact integer amount handling, optional source/transfer and separate memo context; deferred quoteId is rejected.
- Independent 60/minute IP bucket using the existing shared-store/memory mechanism, endpoint-only wildcard CORS, response version header and sanitized application logs.
- Scoped Node API transport handling ordinary unsupported methods, including TRACE, before body construction; approved OPTIONS/204 and documented parser/connection boundaries.
- OpenAPI/API reference, exhaustive finding templates, limits/version policy and eight deterministic synthetic quote fixture families with explicit legacy/fault-injection coverage.

- Local checker deep links with shared validation, full legacy result rendering, server-side automatic checks and opt-in memo/lookupMemo copying; preview browser acceptance remains pending.

### Security

- Unknown required checks do not become public pass. Quote lookup failures return business block/QUOTE_UNAVAILABLE, not pass.
- Documented provider/signature, ownership, delivery/finality/recovery, logging/storage and rate-limit limitations. No wallet connection, signing or transfer capability was added.

### Pending release decisions

- Human release/deployment review, licensing clarification for later packaging, later gated integrations and explicit publication authorization. No later phase is represented as implemented.

See [version policy](docs/versioning.md), [API](docs/api.md), [findings](docs/findings.md) and [limits](docs/limits.md).

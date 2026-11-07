# Changelog

All notable changes to the verification contract will be documented here, following Keep a Changelog and semantic versioning. This file starts with the planned **1.0.0** contract, not a claim that it has been released.

## [Unreleased]

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

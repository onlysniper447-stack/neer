# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability
reporting for this repository:
[Report a vulnerability](https://github.com/onlysniper447-stack/neer/security/advisories/new)
(Security tab → Advisories → Report a vulnerability).

Do not open a public issue or pull request for a security problem. Include
what you found, where (URL, route or package), steps to reproduce and the
impact you expect. Do not include real seed phrases, private keys or funds in
a report.

## Scope

- The Neer web app and its pages (https://neer-one.vercel.app, `apps/web`).
- Its HTTP API: `/api/v1/*` (including `/api/v1/verify` and the `/v1/verify`
  alias, and the RHEA routes `/api/v1/rhea/*`).
- The packages in this repository: `@neer/core`, `@neer/oneclick`,
  `@neer/react`, `@neer/verify` and `@neer/mcp-verify`.

Out of scope: NEAR Intents / 1Click, RHEA Finance and other third-party
services Neer reads from. Report issues in those to their owners.

## What Neer never asks for

Neer never asks for a seed phrase, private key or wallet signature, never
connects a wallet and never sends funds. Anyone who asks for these in Neer's
name is not Neer.

## Supported versions

Only the latest production release (the deployment at
https://neer-one.vercel.app) and the current source of the packages in this
repository get security fixes. The packages are not published to npm.

## Response

This is a small independent project. Reports are read and answered on a
best-effort basis; there is no guaranteed response or fix time.

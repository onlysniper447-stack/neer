# Add an opt-in deposit review link

Local, unreleased integration guide. This feature is in the QA preview, not deployed to the production default origin. Add an optional review link **after a quote returns its deposit address and before deposit submission**. It does not need wallet access and does not sign or send a transaction. Do not replace the app's own security checks or imply a pass guarantees delivery.

Use `/check` with complete canonical verification context, not a made-up quote ID. No parameters preserves the manual entry; exactly address with optional memo preserves legacy quote lookup, not automatic full verification. New verification-context links require the shared strict validator. Partial, unknown, duplicate or deferred quoteId fields show editable errors without checking.

## Parameter mapping

All names are case-sensitive and single-valued. See the authoritative [deep-link contract](../deep-links.md) and [API](../api.md).

| Query | Meaning |
|---|---|
| address | Required depositAddress from quote; no depositAddress query alias |
| network | Required canonical selected sending network ID |
| token | Required canonical token assetId, not ticker |
| amount | Required human-readable decimal amount, not base units |
| memo | Optional sending memo; empty means explicit null |
| lookupMemo | Optional separate quote lookup memo; defaults to memo/null |
| source | Optional wallet/exchange/unknown; missing remains unknown and cannot pass |
| chainId | Optional positive safe-integer EVM chain ID, digits only |
| from | Optional declared sender, not proof of control |
| to | Optional declared destination compared with quote |

No raw quotes, arbitrary JSON transfer objects, key material or signing input is accepted. Encode values with URLSearchParams. Explicit unknown source is preferable to inventing wallet context.

## One-line button example

This fake relative example intentionally omits both memo fields. Render the button only within an explicitly reviewed Neer preview/local origin, or prefix a reviewed origin. It cannot find a real quote and must never receive funds:

```html
<a href="/check?address=FAKE_DEPOSIT_ADDRESS&amp;network=eth&amp;token=nep141%3Afake-usdc.omft.near&amp;amount=5&amp;source=unknown">Review deposit details</a>
```

For real integration, derive fields from the current quote and actual sending screen. Do not infer unknown source, decimals or chain identity. Do not share either sending memo or lookupMemo without explicit consent; a required lookup memo may need a private input step instead. Copy link defaults to excluding both, and resets consent when the result/input changes. Address and other URL fields still enter browser history, sharing surfaces and potentially hosting/provider logs; links are not private storage.

A link auto-runs verification while the server renders the page. Editing hides the old result; rerun after any details change. A link does not freeze a pass or extend quote expiry. Missing source/unknown required checks cannot authorize sending. A block or unavailable quote is not permission to submit a deposit. Read [findings](../findings.md) and [limits](../limits.md): counterparty ownership, token legitimacy, solver behavior and final delivery are not independently established, and sent funds cannot be recovered by Neer.

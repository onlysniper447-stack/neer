# Recorded 1Click responses

Recorded from the public 1Click API on 27 Oct 2026 (no funds were sent).

| File | Request |
| --- | --- |
| `quote_arb_usdc_live.json` | `POST /v0/quote`, non-dry, 5 USDC Arbitrum -> USDC Solana |
| `status_arb_usdc_live.json` | `GET /v0/status?depositAddress=0x4A65…Fe93` for that quote (PENDING_DEPOSIT) |
| `quote_eth_dry.json` | `POST /v0/quote`, dry, 0.17 ETH Ethereum -> USDC Solana |
| `tokens_live.json` | `GET /v0/tokens` (208 tokens) |

All three quotes carry real 1Click Ed25519 signatures and verify with the
official SDK and with `@neer/core`.

Observed shapes worth knowing:

- `/v0/status` returns `quoteResponse` **without** `correlationId` (the OpenAPI marks it required).
- `swapDetails` fields are `null` until the swap progresses; `refundFee` and `withdrawFee` also appear there.
- `/v0/status` lookup is case-insensitive for EVM deposit addresses.
- Unknown address: HTTP 404 `{"message":"Deposit address … not found","error":"Not Found","statusCode":404,…}`.
- `/v0/tokens` lists blockchains (`abs`, `qtc`) that are not in the OpenAPI enum.
- `quoteRequest.deadline` (refunds begin) was 30 minutes out while `quote.deadline` was 3 days out.

# Optional deposit review before submission

DRAFT — requires human review before sending.

## Proposed insertion point

After the swap quote returns its deposit address and before deposit submission, offer an opt-in “Review deposit details” link. Keep the existing swap flow available; do not connect another wallet or request a signature for review.

Map the current deposit address, selected network, canonical token assetId and human-readable sending amount. Preserve actual source/transfer context; do not infer wallet, decimals or chain identity. Exclude sending memo and lookupMemo from shared links unless explicitly consented to. No quoteId lookup is supported.

Illustrative diff sketch only, not an implementation:

```diff
 const quote = await getQuote();
+// Optional: render a review link from current, validated sending details.
+// Do not include either memo without explicit consent.
 // Existing deposit submission remains separate; review never sends funds.
```

Local design references: [swap-app integration](../docs/integrations/swap-apps.md), [deep links](../docs/deep-links.md), [limits](../docs/limits.md). These files and the verifier remain unreleased local/QA work; public repository links must be confirmed after a separately approved release. The default production origin does not yet serve the verifier; the MCP package is unpublished.

A pass only describes supported quote comparisons, not counterparty ownership or delivery. Block/unavailable means do not send. Recheck changed or stale details; Neer cannot recover sent funds. Maintainer review, privacy review and release approval are required before proposing a real patch. No PR has been opened or sent.

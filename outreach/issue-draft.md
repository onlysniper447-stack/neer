# Would an opt-in deposit review fit this flow?

DRAFT — requires human review before sending.

Would maintainers consider an optional review link after the quote supplies a deposit address and before deposit submission? It would compare declared sending details against the quote, without wallet access, signing or submission. Existing flow remains separate; a pass is not a delivery or counterparty guarantee.

Proposed design: [integration guide](../docs/integrations/swap-apps.md), [API](../docs/api.md), [limitations](../docs/limits.md). These are local draft-relative links; the files have not been released to the public repository. Confirm actual public links after separate release approval before sending this issue. No destination repository or maintainer is selected by this draft.

Both sending memo and lookupMemo would stay out of shared links without explicit consent. Missing/unknown checks cannot become a pass. The verifier is QA-only, the default production endpoint is not deployed, and the MCP package is unpublished. Would this insertion point and opt-in approach be acceptable before anyone prepares an implementation?

This file is not an opened issue or a request to send one.

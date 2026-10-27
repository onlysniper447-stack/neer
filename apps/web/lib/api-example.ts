/** The request shown on the landing page. e2e/api.spec.ts posts this exact body. */
export const API_EXAMPLE_BODY = {
  deposit: { address: "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39", memo: null },
  transfer: { chain: "base", asset: "native", amount: "170000000000000000", source: "wallet" },
} as const;

export function apiExample(origin: string): string {
  const d = API_EXAMPLE_BODY;
  return `curl -X POST ${origin}/api/v1/preflight \\
  -H 'content-type: application/json' \\
  -d '{
    "deposit":  { "address": "${d.deposit.address}", "memo": null },
    "transfer": { "chain": "${d.transfer.chain}", "asset": "${d.transfer.asset}",
                  "amount": "${d.transfer.amount}", "source": "${d.transfer.source}" }
  }'`;
}

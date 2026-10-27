import { decodeFunctionData, erc20Abi, isHex } from "viem";
import type { DraftTx } from "./types.js";

export type DecodedTx =
  | { kind: "native"; to: string; amount: bigint }
  | { kind: "erc20-transfer"; token: string; to: string; amount: bigint }
  | { kind: "approval"; method: string }
  | { kind: "other"; selector: string };

/** Selectors that grant spending rights instead of sending funds. A deposit never needs one. */
const APPROVAL_SELECTORS: Record<string, string> = {
  "0x095ea7b3": "approve",
  "0x39509351": "increaseAllowance",
  "0xa22cb465": "setApprovalForAll",
  "0xd505accf": "permit",
  "0x8fcbaf0c": "permit (DAI)",
  "0x2b67b570": "Permit2 permit",
  "0x2a2d80d1": "Permit2 permitBatch",
  "0x87517c45": "Permit2 approve",
  "0x23b872dd": "transferFrom",
};

const TRANSFER_SELECTOR = "0xa9059cbb";

export function decodeDraftTx(tx: DraftTx): DecodedTx {
  const data = (tx.data ?? "0x").toLowerCase();
  const value = BigInt(tx.value ?? "0");
  if (data === "0x") return { kind: "native", to: tx.to, amount: value };
  const selector = data.slice(0, 10);
  const approval = APPROVAL_SELECTORS[selector];
  if (approval) return { kind: "approval", method: approval };
  if (selector === TRANSFER_SELECTOR && isHex(data) && value === 0n) {
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data });
      if (decoded.functionName === "transfer") {
        const [to, amount] = decoded.args;
        return { kind: "erc20-transfer", token: tx.to, to, amount };
      }
    } catch {
      return { kind: "other", selector };
    }
  }
  return { kind: "other", selector };
}

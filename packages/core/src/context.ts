import { chainByEvmId, getChain } from "./chains.js";
import { DEFAULT_RULES, type RulesConfig } from "./rules-config.js";
import type { QuoteResponse, StatusResponse, Token } from "./schemas.js";
import { decodeDraftTx, type DecodedTx } from "./tx.js";
import type { DeclaredTransfer } from "./types.js";

export interface Ctx {
  pasted: string;
  qr: QuoteResponse;
  signatureOk: boolean;
  /** A partner-supplied quote that differs from the one 1Click returns for this address. */
  partnerQuoteMismatch: boolean;
  status: StatusResponse | null;
  fetchedAt: Date | null;
  tokens: Token[];
  originToken?: Token;
  destToken?: Token;
  originChain?: string;
  destChain?: string;
  /** Network the user says they will send on (from chain, chainId or the draft tx). */
  declaredChain?: string;
  chainIdConflict?: { chainId: number; chain: string };
  unknownChainId?: number;
  /** Declared asset string ("native", contract or assetId), possibly derived from the draft tx. */
  asset?: string;
  amount?: bigint;
  /** Memo the user will attach; null means none. */
  memo: string | null;
  from?: string;
  /** Address the transfer will actually go to, when we know it (declared or decoded from the tx). */
  to?: string;
  source: DeclaredTransfer["source"];
  decoded?: DecodedTx;
  now: Date;
  rules: RulesConfig;
}

export function findToken(tokens: Token[], assetId: string): Token | undefined {
  return tokens.find((t) => t.assetId === assetId);
}

export function isNative(t: Token): boolean {
  return !t.contractAddress;
}

/** Resolves "native" / contract address / assetId to a 1Click token on a chain. */
export function resolveDeclaredToken(tokens: Token[], chain: string | undefined, asset: string): Token | undefined {
  if (/^(nep141|nep245|1cs_v1):/.test(asset)) return findToken(tokens, asset);
  if (!chain) return undefined;
  const onChain = tokens.filter((t) => t.blockchain === chain);
  if (asset.toLowerCase() === "native") return onChain.find(isNative);
  const evm = getChain(chain).family === "evm";
  return onChain.find((t) =>
    t.contractAddress ? (evm ? t.contractAddress.toLowerCase() === asset.toLowerCase() : t.contractAddress === asset) : false,
  );
}

export function buildContext(args: {
  pasted: string;
  pastedMemo: string | null;
  qr: QuoteResponse;
  signatureOk: boolean;
  partnerQuoteMismatch: boolean;
  status: StatusResponse | null;
  fetchedAt: Date | null;
  transfer: DeclaredTransfer;
  tokens: Token[];
  now: Date;
  rules?: RulesConfig;
}): Ctx {
  const { qr, transfer, tokens } = args;
  const originToken = findToken(tokens, qr.quoteRequest.originAsset);
  const destToken = findToken(tokens, qr.quoteRequest.destinationAsset);

  const decoded = transfer.tx ? decodeDraftTx(transfer.tx) : undefined;

  let declaredChain = transfer.chain;
  let chainIdConflict: Ctx["chainIdConflict"];
  let unknownChainId: number | undefined;
  const chainIds = [transfer.chainId, transfer.tx?.chainId].filter((x): x is number => x !== undefined);
  for (const id of chainIds) {
    const byId = chainByEvmId(id);
    if (!byId) {
      unknownChainId = id;
      continue;
    }
    if (declaredChain === undefined) declaredChain = byId.id;
    else if (declaredChain !== byId.id) chainIdConflict = { chainId: id, chain: declaredChain };
  }

  let asset = transfer.asset;
  let amount = transfer.amount !== undefined ? BigInt(transfer.amount) : undefined;
  let to = transfer.to;
  if (decoded?.kind === "native") {
    asset = "native";
    amount = decoded.amount;
    to = decoded.to;
  } else if (decoded?.kind === "erc20-transfer") {
    asset = decoded.token;
    amount = decoded.amount;
    to = decoded.to;
  }

  const memo = transfer.memo === undefined ? args.pastedMemo : transfer.memo;

  return {
    pasted: args.pasted,
    qr,
    signatureOk: args.signatureOk,
    partnerQuoteMismatch: args.partnerQuoteMismatch,
    status: args.status,
    fetchedAt: args.fetchedAt,
    tokens,
    originToken,
    destToken,
    originChain: originToken?.blockchain,
    destChain: destToken?.blockchain,
    declaredChain,
    chainIdConflict,
    unknownChainId,
    asset,
    amount,
    memo: memo === undefined || memo === "" ? null : memo,
    from: transfer.from,
    to,
    source: transfer.source,
    decoded,
    now: args.now,
    rules: args.rules ?? DEFAULT_RULES,
  };
}

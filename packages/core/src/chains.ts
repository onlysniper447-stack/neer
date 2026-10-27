/**
 * Chain registry keyed by the 1Click `blockchain` identifier (see /v0/tokens).
 *
 * `confirmBudgetSec` is the time we budget for a deposit on that chain to be
 * sent and confirmed. These are conservative starting values (an assumption,
 * documented in the README), used by the time check.
 */
export type AddressFamily =
  | "evm"
  | "solana"
  | "tron"
  | "stellar"
  | "xrp"
  | "ton"
  | "btc"
  | "near"
  | "unsupported";

export interface ChainInfo {
  id: string;
  name: string;
  family: AddressFamily;
  /** EVM chain id, only for EVM chains we are sure about. */
  evmChainId?: number;
  confirmBudgetSec: number;
}

const MIN = 60;

const CHAINS: ChainInfo[] = [
  { id: "eth", name: "Ethereum", family: "evm", evmChainId: 1, confirmBudgetSec: 5 * MIN },
  { id: "base", name: "Base", family: "evm", evmChainId: 8453, confirmBudgetSec: 2 * MIN },
  { id: "arb", name: "Arbitrum", family: "evm", evmChainId: 42161, confirmBudgetSec: 2 * MIN },
  { id: "op", name: "Optimism", family: "evm", evmChainId: 10, confirmBudgetSec: 2 * MIN },
  { id: "pol", name: "Polygon", family: "evm", evmChainId: 137, confirmBudgetSec: 3 * MIN },
  { id: "bsc", name: "BNB Chain", family: "evm", evmChainId: 56, confirmBudgetSec: 2 * MIN },
  { id: "avax", name: "Avalanche", family: "evm", evmChainId: 43114, confirmBudgetSec: 2 * MIN },
  { id: "gnosis", name: "Gnosis", family: "evm", evmChainId: 100, confirmBudgetSec: 2 * MIN },
  { id: "bera", name: "Berachain", family: "evm", evmChainId: 80094, confirmBudgetSec: 2 * MIN },
  { id: "monad", name: "Monad", family: "evm", evmChainId: 143, confirmBudgetSec: 2 * MIN },
  { id: "xlayer", name: "X Layer", family: "evm", evmChainId: 196, confirmBudgetSec: 2 * MIN },
  { id: "scroll", name: "Scroll", family: "evm", evmChainId: 534352, confirmBudgetSec: 2 * MIN },
  { id: "plasma", name: "Plasma", family: "evm", evmChainId: 9745, confirmBudgetSec: 2 * MIN },
  { id: "abs", name: "Abstract", family: "evm", evmChainId: 2741, confirmBudgetSec: 2 * MIN },
  { id: "hlevm", name: "HyperEVM", family: "evm", evmChainId: 999, confirmBudgetSec: 2 * MIN },
  // EVM address format is certain for these, but we have not verified their chain ids.
  { id: "hood", name: "Robinhood Chain", family: "evm", confirmBudgetSec: 2 * MIN },
  { id: "adi", name: "ADI Chain", family: "evm", confirmBudgetSec: 2 * MIN },
  { id: "sol", name: "Solana", family: "solana", confirmBudgetSec: 1 * MIN },
  { id: "tron", name: "Tron", family: "tron", confirmBudgetSec: 2 * MIN },
  { id: "stellar", name: "Stellar", family: "stellar", confirmBudgetSec: 1 * MIN },
  { id: "xrp", name: "XRP Ledger", family: "xrp", confirmBudgetSec: 1 * MIN },
  { id: "ton", name: "TON", family: "ton", confirmBudgetSec: 2 * MIN },
  { id: "btc", name: "Bitcoin", family: "btc", confirmBudgetSec: 60 * MIN },
  { id: "near", name: "NEAR", family: "near", confirmBudgetSec: 1 * MIN },
  { id: "doge", name: "Dogecoin", family: "unsupported", confirmBudgetSec: 30 * MIN },
  { id: "ltc", name: "Litecoin", family: "unsupported", confirmBudgetSec: 30 * MIN },
  { id: "bch", name: "Bitcoin Cash", family: "unsupported", confirmBudgetSec: 30 * MIN },
  { id: "zec", name: "Zcash", family: "unsupported", confirmBudgetSec: 30 * MIN },
  { id: "dash", name: "Dash", family: "unsupported", confirmBudgetSec: 30 * MIN },
  { id: "sui", name: "Sui", family: "unsupported", confirmBudgetSec: 2 * MIN },
  { id: "aptos", name: "Aptos", family: "unsupported", confirmBudgetSec: 2 * MIN },
  { id: "movement", name: "Movement", family: "unsupported", confirmBudgetSec: 2 * MIN },
  { id: "cardano", name: "Cardano", family: "unsupported", confirmBudgetSec: 10 * MIN },
  { id: "starknet", name: "Starknet", family: "unsupported", confirmBudgetSec: 5 * MIN },
  { id: "aleo", name: "Aleo", family: "unsupported", confirmBudgetSec: 5 * MIN },
  { id: "hypercore", name: "Hyperliquid", family: "unsupported", confirmBudgetSec: 2 * MIN },
  { id: "fogo", name: "Fogo", family: "unsupported", confirmBudgetSec: 2 * MIN },
];

const BY_ID = new Map(CHAINS.map((c) => [c.id, c]));
const BY_EVM_ID = new Map(
  CHAINS.filter((c) => c.evmChainId !== undefined).map((c) => [c.evmChainId as number, c]),
);

/** Fallback used for a blockchain id that 1Click lists but we have not catalogued. */
const UNKNOWN_BUDGET_SEC = 10 * MIN;

export function getChain(id: string): ChainInfo {
  return (
    BY_ID.get(id) ?? { id, name: id.toUpperCase(), family: "unsupported", confirmBudgetSec: UNKNOWN_BUDGET_SEC }
  );
}

export function isKnownChain(id: string): boolean {
  return BY_ID.has(id);
}

export function chainByEvmId(chainId: number): ChainInfo | undefined {
  return BY_EVM_ID.get(chainId);
}

export function chainName(id: string): string {
  return getChain(id).name;
}

export function listChains(): readonly ChainInfo[] {
  return CHAINS;
}

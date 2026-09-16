/** GenLayer Studio Next, the one network this build speaks to. */
import { studioDevnet } from "genlayer-js/chains";

export const RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio-next.genlayer.com/api";

export const STUDIO_NEXT = {
  ...studioDevnet,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: [RPC_URL] } },
};

export const CHAIN_ID = STUDIO_NEXT.id;
export const CHAIN_HEX = `0x${CHAIN_ID.toString(16).toUpperCase()}`;

export const EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Errors worth an automatic retry: rate limits and transport drops. */
export function isTransient(e: unknown): boolean {
  const text = String((e as Error)?.message ?? e ?? "").toLowerCase();
  return (
    text.includes("429") ||
    text.includes("-32029") ||
    text.includes("rate") ||
    text.includes("fetch failed") ||
    text.includes("econnreset") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("502") ||
    text.includes("503")
  );
}

/** The network entry a wallet adds. */
export const WALLET_NETWORK = {
  chainId: CHAIN_HEX,
  chainName: "GenLayer Studio Next",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [] as string[],
};

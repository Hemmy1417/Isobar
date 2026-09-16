"use client";

/**
 * The wallet layer: EIP-6963 discovery (every installed wallet announces
 * itself; two extensions never fight over one global), connection state,
 * and the network handshake. The SELECTED provider is what the
 * Transaction Kit signs through — never a bare window.ethereum grab, so a
 * multi-wallet browser signs with the wallet the person actually chose.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { CHAIN_HEX, STUDIO_NEXT, WALLET_NETWORK } from "./chain";

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface Discovered {
  info: { uuid: string; name: string; icon?: string };
  provider: Eip1193;
}

interface WalletState {
  wallets: Discovered[];
  address: string;
  /** The provider of the CONNECTED wallet — hand this to the kit. */
  provider: Eip1193 | null;
  chainOk: boolean;
  connecting: boolean;
  error: string;
  connect: (w: Discovered) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet used outside WalletProvider");
  return v;
}

function isUnknownChain(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 4902 || String((err as Error)?.message ?? "").includes("4902");
}

async function ensureChain(provider: Eip1193): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if (!isUnknownChain(err)) throw err;
    await provider.request({ method: "wallet_addEthereumChain", params: [WALLET_NETWORK] });
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch {
      /* chainOk reports the outcome */
    }
  }
}

function walletErrorMessage(err: unknown): string {
  const code = (err as { code?: number })?.code;
  if (code === 4001) return "You declined in the wallet. Nothing was sent.";
  if (code === -32002) return "The wallet already shows a pending request — open it to continue.";
  return `The wallet refused: ${String((err as Error)?.message ?? err).slice(0, 140)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Discovered[]>([]);
  const [selected, setSelected] = useState<Discovered | null>(null);
  const [address, setAddress] = useState("");
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const found = new Map<string, Discovered>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent).detail as Discovered;
      if (d?.info?.uuid && !found.has(d.info.uuid)) {
        found.set(d.info.uuid, d);
        setWallets([...found.values()]);
      }
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  const adopt = useCallback((d: Discovered, addr: string) => {
    setSelected(d);
    setAddress(addr);
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) {
        setSelected(null);
        setAddress("");
      } else setAddress(list[0]);
    };
    const onChain = (chainId: unknown) => setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
    d.provider.removeListener?.("accountsChanged", onAccounts);
    d.provider.removeListener?.("chainChanged", onChain);
    d.provider.on?.("accountsChanged", onAccounts);
    d.provider.on?.("chainChanged", onChain);
  }, []);

  const connect = useCallback(async (d: Discovered) => {
    setConnecting(true);
    setError("");
    try {
      const accounts = (await d.provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.[0]) throw new Error("The wallet returned no account.");
      await ensureChain(d.provider);
      const chainId = (await d.provider.request({ method: "eth_chainId" })) as string;
      setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
      adopt(d, accounts[0]);
    } catch (err) {
      setError(walletErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  }, [adopt]);

  const disconnect = useCallback(() => {
    setSelected(null);
    setAddress("");
    setChainOk(false);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!selected) return;
    setError("");
    try {
      await ensureChain(selected.provider);
      const chainId = (await selected.provider.request({ method: "eth_chainId" })) as string;
      setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
    } catch (err) {
      setError(walletErrorMessage(err));
    }
  }, [selected]);

  const value = useMemo<WalletState>(() => ({
    wallets,
    address,
    provider: selected?.provider ?? null,
    chainOk,
    connecting,
    error,
    connect,
    disconnect,
    switchNetwork,
  }), [wallets, address, selected, chainOk, connecting, error, connect, disconnect, switchNetwork]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { STUDIO_NEXT };

/**
 * @vitest-environment jsdom
 *
 * A reload keeps the wallet connected — silently. The chosen wallet is
 * remembered by its stable EIP-6963 rdns; on load the app asks it with
 * eth_accounts (never a prompt) and reconnects only if the site is still
 * granted. Disconnect forgets it, and a wallet-side disconnect is honoured.
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet, WalletProvider, type Eip1193 } from "../lib/wallet";

const LOWER = "0x169ce1cd5aaa013adee55a4b3ed86752cc999375";
const CHECKSUMMED = "0x169cE1cD5aAa013adee55a4B3ed86752cc999375";

function fakeWallet(granted: string[]) {
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_accounts") return granted;
    if (method === "eth_requestAccounts") return granted;
    if (method === "eth_chainId") return "0xf22d";
    return null;
  });
  const provider: Eip1193 = {
    request: request as Eip1193["request"],
    on: (event, h) => { handlers[event] = h; },
    removeListener: (event, h) => { if (handlers[event] === h) delete handlers[event]; },
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: crypto.randomUUID(), name: "MetaMask", rdns: "io.metamask" }, provider },
  }));
  window.addEventListener("eip6963:requestProvider", announce);
  return { request, handlers, stop: () => window.removeEventListener("eip6963:requestProvider", announce) };
}

let seen: ReturnType<typeof useWallet> | null = null;
function Probe() {
  seen = useWallet();
  return null;
}
const mount = () => render(<WalletProvider><Probe /></WalletProvider>);

let wallet: ReturnType<typeof fakeWallet> | null = null;
beforeEach(() => {
  localStorage.clear();
  seen = null;
});
afterEach(() => {
  wallet?.stop();
  cleanup();
});

describe("the wallet survives a reload", () => {
  it("restores the remembered wallet silently, checksummed, without any prompt", async () => {
    localStorage.setItem("isobar.wallet", "io.metamask");
    wallet = fakeWallet([LOWER]);
    mount();
    await waitFor(() => expect(seen?.address).toBe(CHECKSUMMED));
    expect(seen?.chainOk).toBe(true);
    expect(seen?.restoring).toBe(false);
    const methods = wallet.request.mock.calls.map((c) => (c[0] as { method: string }).method);
    expect(methods).toContain("eth_accounts");
    expect(methods).not.toContain("eth_requestAccounts");
  });

  it("does nothing for a visitor who never connected", async () => {
    wallet = fakeWallet([LOWER]);
    mount();
    await waitFor(() => expect(seen?.wallets.length).toBe(1));
    expect(seen?.address).toBe("");
    expect(wallet.request).not.toHaveBeenCalled();
  });

  it("forgets a wallet that no longer grants the site", async () => {
    localStorage.setItem("isobar.wallet", "io.metamask");
    wallet = fakeWallet([]);
    mount();
    await waitFor(() => expect(seen?.restoring).toBe(false));
    expect(seen?.address).toBe("");
    expect(localStorage.getItem("isobar.wallet")).toBeNull();
  });

  it("remembers on connect, forgets on disconnect, and ignores the old wallet's events after", async () => {
    wallet = fakeWallet([LOWER]);
    mount();
    await waitFor(() => expect(seen?.wallets.length).toBe(1));
    await act(async () => { await seen!.connect(seen!.wallets[0]); });
    expect(seen?.address).toBe(CHECKSUMMED);
    expect(localStorage.getItem("isobar.wallet")).toBe("io.metamask");

    act(() => seen!.disconnect());
    expect(seen?.address).toBe("");
    expect(localStorage.getItem("isobar.wallet")).toBeNull();
    expect(wallet.handlers.accountsChanged).toBeUndefined();
  });

  it("honours a disconnect made inside the wallet", async () => {
    localStorage.setItem("isobar.wallet", "io.metamask");
    wallet = fakeWallet([LOWER]);
    mount();
    await waitFor(() => expect(seen?.address).toBe(CHECKSUMMED));
    act(() => wallet!.handlers.accountsChanged([]));
    expect(seen?.address).toBe("");
    expect(localStorage.getItem("isobar.wallet")).toBeNull();
  });
});

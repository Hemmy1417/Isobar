/**
 * S6, the provider-backed-client clause: signed writes must go through
 * the CONNECTED wallet's provider — never a bare window.ethereum grab —
 * and the judges' letters on two sibling builds asked for a repo-level
 * test of exactly that wiring. This is it: the kit factory receives the
 * selected provider object by identity, the connected account, and a fee
 * profile pinned to this chain; and no kit exists to sign with when the
 * wallet is absent or on the wrong network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransactionKit: vi.fn(() => ({ configured: true })),
  wallet: {
    provider: null as unknown,
    address: "",
    chainOk: false,
  },
}));

vi.mock("@genlayer/transaction-kit", () => ({
  createTransactionKit: mocks.createTransactionKit,
}));

// The hook body must run as a plain function: useMemo becomes identity.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (fn: () => unknown) => fn(),
}));

vi.mock("../lib/wallet", () => ({
  useWallet: () => mocks.wallet,
}));

import { STUDIO_NEXT } from "../lib/chain";
import { useTransactionKit } from "../lib/kit";

const ACCOUNT = "0x1111111111111111111111111111111111111111";

beforeEach(() => {
  mocks.createTransactionKit.mockClear();
  mocks.wallet.provider = null;
  mocks.wallet.address = "";
  mocks.wallet.chainOk = false;
});

describe("the kit signs through the selected wallet", () => {
  it("receives the connected provider BY IDENTITY, with the account and chain", () => {
    const selectedProvider = { request: vi.fn() };
    mocks.wallet.provider = selectedProvider;
    mocks.wallet.address = ACCOUNT;
    mocks.wallet.chainOk = true;

    const kit = useTransactionKit();

    expect(kit).not.toBeNull();
    expect(mocks.createTransactionKit).toHaveBeenCalledTimes(1);
    const opts = (mocks.createTransactionKit.mock.calls[0] as unknown[])[0] as {
      chain: unknown; provider: unknown; account: string;
      suggestions: { chainId: number };
    };
    // Identity, not shape: the exact object the person connected — a
    // second injected wallet's provider could never satisfy this.
    expect(opts.provider).toBe(selectedProvider);
    expect(opts.account).toBe(ACCOUNT);
    expect(opts.chain).toBe(STUDIO_NEXT);
  });

  it("carries the fee profile pinned to this chain, or the kit ignores it", () => {
    mocks.wallet.provider = { request: vi.fn() };
    mocks.wallet.address = ACCOUNT;
    mocks.wallet.chainOk = true;

    useTransactionKit();

    const opts = (mocks.createTransactionKit.mock.calls[0] as unknown[])[0] as {
      suggestions: { chainId: number };
    };
    expect(opts.suggestions.chainId).toBe(STUDIO_NEXT.id);
  });

  it("builds no kit without a connected provider — nothing to sign with", () => {
    mocks.wallet.address = ACCOUNT;
    mocks.wallet.chainOk = true;
    expect(useTransactionKit()).toBeNull();
    expect(mocks.createTransactionKit).not.toHaveBeenCalled();
  });

  it("builds no kit on the wrong network — no write can target another chain", () => {
    mocks.wallet.provider = { request: vi.fn() };
    mocks.wallet.address = ACCOUNT;
    mocks.wallet.chainOk = false;
    expect(useTransactionKit()).toBeNull();
    expect(mocks.createTransactionKit).not.toHaveBeenCalled();
  });
});

/**
 * Every consumer signs and reads on the ONE resolved network: the read
 * client here, the Transaction Kit and payout client in kit.test.ts, and the
 * wallet's add/switch requests through WALLET_NETWORK/CHAIN_HEX (identity-
 * checked in network-config.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readContract: vi.fn(async () => JSON.stringify({ markets: 0, tickets: 0 })),
  createClient: vi.fn(),
}));
mocks.createClient.mockImplementation(() => ({ readContract: mocks.readContract }));

vi.mock("genlayer-js", () => ({ createClient: mocks.createClient }));

import { CONTRACT_ADDRESS } from "../lib/config";
import { GENLAYER_CHAIN } from "../lib/network";
import { getStats } from "../lib/read";

describe("network consumers", () => {
  beforeEach(() => mocks.readContract.mockClear());

  it("reads the contract through the shared chain, unsigned", async () => {
    await getStats();
    expect(mocks.createClient).toHaveBeenCalledWith({ chain: GENLAYER_CHAIN });
    expect(mocks.readContract).toHaveBeenCalledWith({
      address: CONTRACT_ADDRESS, functionName: "get_stats", args: [],
    });
  });
});

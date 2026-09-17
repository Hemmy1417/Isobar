/**
 * The faucet counts in atto and credits only checksummed addresses
 * (both measured live, 17 Sep): the button must send whole GEN to the
 * contract's spelling of the account.
 */
import { describe, expect, it } from "vitest";

import { faucetParams, TEST_GEN_WEI } from "../lib/faucet";

describe("test GEN requests", () => {
  it("asks for 10 GEN in atto, for the checksummed address", () => {
    expect(faucetParams("0x169ce1cd5aaa013adee55a4b3ed86752cc999375"))
      .toEqual(["0x169cE1cD5aAa013adee55a4B3ed86752cc999375", "10000000000000000000"]);
    expect(TEST_GEN_WEI).toBe(10n ** 19n);
  });

  it("refuses without a connected account", () => {
    expect(() => faucetParams("")).toThrow(/Connect a wallet/);
  });
});

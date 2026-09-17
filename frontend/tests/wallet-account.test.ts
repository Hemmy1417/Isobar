/**
 * The contract keys positions, balances and "my markets" by the signer's
 * EIP-55 checksummed address and looks them up by exact string. Measured on
 * the deployment of record (17 Sep): my_markets(operator) returned four
 * markets checksummed and [] lowercase. Wallets commonly report lowercase —
 * so every account the app uses must be checksummed first.
 */
import { describe, expect, it } from "vitest";

import { accountOf } from "../lib/wallet";

const CHECKSUMMED = "0x169cE1cD5aAa013adee55a4B3ed86752cc999375";

describe("the connected account is the contract's own spelling", () => {
  it("checksums a lowercase wallet address", () => {
    expect(accountOf(CHECKSUMMED.toLowerCase())).toBe(CHECKSUMMED);
  });

  it("checksums an uppercase wallet address", () => {
    expect(accountOf("0x" + CHECKSUMMED.slice(2).toUpperCase())).toBe(CHECKSUMMED);
  });

  it("keeps an already-checksummed address unchanged", () => {
    expect(accountOf(CHECKSUMMED)).toBe(CHECKSUMMED);
  });

  it("treats anything that is not an address as no account", () => {
    expect(accountOf("0x1234")).toBe("");
    expect(accountOf(undefined)).toBe("");
    expect(accountOf(42)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { studioDevnet } from "genlayer-js/chains";

import { CHAIN_HEX, RPC_URL, STUDIO_NEXT, WALLET_NETWORK } from "../lib/chain";
import {
  GENLAYER_CHAIN,
  GENLAYER_CHAIN_ID,
  GENLAYER_CHAIN_ID_HEX,
  GENLAYER_NETWORK,
  createGenLayerNetworkConfig,
} from "../lib/network";

describe("GenLayer network configuration", () => {
  it("defaults every consumer to Studio Next (chain 61997)", () => {
    expect(GENLAYER_CHAIN).toMatchObject({
      id: 61997,
      name: "GenLayer Studio Next",
      rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } },
    });
    expect(GENLAYER_CHAIN_ID).toBe(studioDevnet.id);
    expect(GENLAYER_CHAIN_ID_HEX).toBe("0xF22D");
    expect(GENLAYER_NETWORK).toMatchObject({
      chainId: GENLAYER_CHAIN_ID_HEX,
      chainName: GENLAYER_CHAIN.name,
      rpcUrls: [...GENLAYER_CHAIN.rpcUrls.default.http],
    });
  });

  it("is the one object the app's chain names resolve to", () => {
    expect(STUDIO_NEXT).toBe(GENLAYER_CHAIN);
    expect(WALLET_NETWORK).toBe(GENLAYER_NETWORK);
    expect(CHAIN_HEX).toBe(GENLAYER_CHAIN_ID_HEX);
    expect(RPC_URL).toBe(GENLAYER_CHAIN.rpcUrls.default.http[0]);
  });

  it("keeps SDK signing and wallet configuration aligned under overrides", () => {
    const { chain, wallet } = createGenLayerNetworkConfig({
      chainId: "12345",
      chainName: "Custom GenLayer",
      rpcUrl: "https://rpc.example.test/api",
      symbol: "TEST",
    });
    expect(chain.id).toBe(12345);
    expect(chain.rpcUrls.default.http).toEqual(["https://rpc.example.test/api"]);
    expect(wallet).toMatchObject({
      chainId: "0x3039",
      chainName: chain.name,
      rpcUrls: [...chain.rpcUrls.default.http],
      nativeCurrency: chain.nativeCurrency,
    });
  });

  it("rejects invalid chain ids before a transaction can be signed", () => {
    expect(() => createGenLayerNetworkConfig({ chainId: "not-a-number" })).toThrow(/must be a positive integer/);
    expect(() => createGenLayerNetworkConfig({ chainId: "0" })).toThrow(/must be a positive integer/);
  });
});

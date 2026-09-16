"use client";

/**
 * The Transaction Kit, bound to the CONNECTED wallet's provider (never a
 * bare window.ethereum grab) and seeded with the fee profile this repo's
 * own test suite measured against Studio Next. A profile whose chainId
 * does not match the chain is ignored by the kit — ours names 61997.
 */
import { createTransactionKit, type TransactionKit } from "@genlayer/transaction-kit";
import { useMemo } from "react";

import { STUDIO_NEXT } from "./chain";
import feeProfile from "./fee-profile.json";
import { useWallet } from "./wallet";

export function useTransactionKit(): TransactionKit | null {
  const { provider, address, chainOk } = useWallet();
  return useMemo(() => {
    if (!provider || !address?.startsWith("0x") || !chainOk) return null;
    return createTransactionKit({
      chain: STUDIO_NEXT,
      provider,
      account: address as `0x${string}`,
      suggestions: feeProfile,
    });
  }, [provider, address, chainOk]);
}

import { readFileSync } from "fs";
import path from "path";
import type {
  DecodedDeployData,
  GenLayerChain,
  GenLayerClient,
  TransactionHash,
} from "genlayer-js/types";
import { localnet } from "genlayer-js/chains";

/**
 * `genlayer deploy` entry point (the boilerplate's shape), for Isobar.
 *
 * The deployment of record was deployed and byte-verified with
 * `node frontend/scripts/deploy.mjs` (which also writes the keys it used and
 * runs `verify`); this script is the CLI path to the same result.
 */
export const CONTRACT_FILE = "contracts/isobar.py";

export const isSuccessfulDeploymentReceipt = (receipt: {
  status?: number | string;
  statusName?: string;
}): boolean => {
  const numericStatus = Number(receipt.status);
  return (
    numericStatus === 5 ||
    numericStatus === 7 ||
    receipt.statusName === "ACCEPTED" ||
    receipt.statusName === "FINALIZED"
  );
};

/**
 * The bytes the chain stores must equal the repo's file for byte
 * verification to hold. A Windows checkout with autocrlf turns LF into CRLF
 * silently; refuse to deploy those bytes rather than ship a contract no
 * reviewer can match against the repository.
 */
export function contractBytes(source: Uint8Array): Uint8Array {
  if (source.includes(13)) {
    throw new Error(
      `${CONTRACT_FILE} contains CR bytes (CRLF line endings); normalize to LF before deploying`,
    );
  }
  return source;
}

export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), CONTRACT_FILE);

  try {
    const contractCode = contractBytes(new Uint8Array(readFileSync(filePath)));

    await client.initializeConsensusSmartContract();

    const deployTransaction = await client.deployContract({
      code: contractCode,
      args: [],
    });

    const receipt = await client.waitForTransactionReceipt({
      hash: deployTransaction as TransactionHash,
      waitUntil: "decided",
      retries: 200,
    });

    if (!isSuccessfulDeploymentReceipt(receipt)) {
      throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
    }

    const deployedContractAddress =
      (client.chain as GenLayerChain).id === localnet.id
        ? receipt.data?.contract_address
        : (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;

    if (!deployedContractAddress) {
      throw new Error("Deployment receipt did not contain a contract address");
    }

    console.log(`Contract deployed at address: ${deployedContractAddress}`);
    console.log(
      `Verify the stored bytes: node frontend/scripts/deploy.mjs verify ${deployedContractAddress}`,
    );
  } catch (error) {
    throw new Error(`Error during deployment: ${error}`);
  }
}

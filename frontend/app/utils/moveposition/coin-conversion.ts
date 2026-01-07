/**
 * Coin Store to Fungible Asset Conversion Utility
 * Converts native coin store balance to fungible asset balance
 * Uses the official function: 0x1::coin::migrate_coin_store_to_fungible_store
 */

import { Aptos, AptosConfig, Network, ChainId } from "@aptos-labs/ts-sdk";
import {
  Ed25519PublicKey,
  Ed25519Signature,
  AccountAuthenticatorEd25519,
  generateSigningMessageForTransaction,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import {
  requireMovementChainId,
  requireMovementRpc,
} from "@/lib/super-aptos-sdk/src/globals";

// Lazy initialization of Aptos instance
let aptosInstance: Aptos | null = null;

function getAptosInstance(): Aptos {
  if (!aptosInstance) {
    const movementRpc = requireMovementRpc();
    aptosInstance = new Aptos(
      new AptosConfig({
        network: Network.MAINNET,
        fullnode: movementRpc,
      })
    );
  }
  return aptosInstance;
}

export interface ConversionParams {
  walletAddress: string;
  publicKey: string;
  signHash: (hash: string) => Promise<{ signature: string }>;
  coinType?: string; // Defaults to "0x1::aptos_coin::AptosCoin" for MOVE/APT
  onProgress?: (step: string) => void;
}

/**
 * Check if user has coin store balance
 */
export async function checkCoinStoreBalance(
  walletAddress: string,
  coinType: string = "0x1::aptos_coin::AptosCoin"
): Promise<{ hasBalance: boolean; balance: bigint }> {
  const aptos = getAptosInstance();

  try {
    const accountResources = await aptos.account.getAccountResources({
      accountAddress: walletAddress,
    });

    const coinStoreType = `0x1::coin::CoinStore<${coinType}>`;
    const coinStore = accountResources.find(
      (resource) => resource.type === coinStoreType
    );

    if (coinStore) {
      const balance = BigInt((coinStore.data as any).coin?.value || "0");
      return {
        hasBalance: balance > BigInt(0),
        balance,
      };
    }

    return { hasBalance: false, balance: BigInt(0) };
  } catch (e) {
    console.warn("[CoinConversion] Could not check coin store balance:", e);
    return { hasBalance: false, balance: BigInt(0) };
  }
}

/**
 * Convert coin store to fungible asset
 * Uses the official function: 0x1::coin::migrate_coin_store_to_fungible_store
 * Converts ALL balance from coin store to fungible asset
 */
export async function convertCoinStoreToFA(
  params: ConversionParams
): Promise<string> {
  const {
    walletAddress,
    publicKey,
    signHash,
    coinType = "0x1::aptos_coin::AptosCoin",
    onProgress,
  } = params;

  const aptos = getAptosInstance();
  const movementChainId = requireMovementChainId();

  if (onProgress) {
    onProgress("Building conversion transaction...");
  }

  // Build conversion transaction using the official function
  // MovePosition uses: 0x1::coin::migrate_to_fungible_store
  const transaction = await aptos.transaction.build.simple({
    sender: walletAddress,
    data: {
      function: "0x1::coin::migrate_to_fungible_store",
      typeArguments: [coinType],
      functionArguments: [],
    },
  });

  // Override chain ID to match Movement Network
  const txnObj = transaction as any;
  if (txnObj.rawTransaction) {
    const movementChainIdObj = new ChainId(movementChainId);
    txnObj.rawTransaction.chain_id = movementChainIdObj;
  }

  if (onProgress) {
    onProgress("Waiting for signature...");
  }

  // Generate signing message and hash
  const message = generateSigningMessageForTransaction(transaction);
  const hash = toHex(message);

  const timeoutMilliseconds = 60000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Conversion signing timed out")),
      timeoutMilliseconds
    )
  );

  const signatureResponse = await Promise.race([
    signHash(hash),
    timeoutPromise,
  ]);

  if (onProgress) {
    onProgress("Creating authenticator...");
  }

  // Process public key format (remove "00" prefix if present)
  let pubKeyNoScheme = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;

  if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
    pubKeyNoScheme = pubKeyNoScheme.slice(2);
  }

  if (pubKeyNoScheme.length !== 64) {
    throw new Error(
      `Invalid public key length: expected 64 hex characters (32 bytes), got ${pubKeyNoScheme.length}`
    );
  }

  const publicKeyObj = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    publicKeyObj,
    sig
  );

  if (onProgress) {
    onProgress("Submitting conversion transaction...");
  }

  const pending = await aptos.transaction.submit.simple({
    transaction,
    senderAuthenticator,
  });

  console.log(
    `[CoinConversion] 🔄 Conversion transaction submitted: ${pending.hash}`
  );

  if (onProgress) {
    onProgress("Waiting for confirmation...");
  }

  const executed = await aptos.waitForTransaction({
    transactionHash: pending.hash,
  });

  if (!executed.success) {
    throw new Error(`Conversion transaction failed: ${pending.hash}`);
  }

  console.log(`[CoinConversion] ✅ Conversion successful: ${executed.hash}`);

  if (onProgress) {
    onProgress("Conversion complete!");
  }

  return executed.hash;
}

import {
  Aptos,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
  AccountAddress,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import { TokenBalance } from "../../types";

interface ExecuteTransferParams {
  aptos: Aptos;
  movementChainId: number;
  senderAddress: string;
  senderPubKeyWithScheme: string;
  selectedToken: TokenBalance;
  toAddress: string;
  amount: string;
  signRawHash: (input: any) => Promise<{ signature: string }>;
}

/**
 * Executes a token transfer transaction on the Movement Network
 * @param params - Transfer parameters
 * @returns Transaction hash of the executed transfer
 * @throws Error if transfer fails
 */
export async function executeTransfer({
  aptos,
  movementChainId,
  senderAddress,
  senderPubKeyWithScheme,
  selectedToken,
  toAddress,
  amount,
  signRawHash,
}: ExecuteTransferParams): Promise<string> {
  if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
    throw new Error("Invalid public key format");
  }

  const pubKeyNoScheme = senderPubKeyWithScheme.slice(2);

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid amount.");
  }

  const decimals = selectedToken.metadata.decimals || 8;
  const amountInSmallestUnit = Math.floor(
    parsedAmount * Math.pow(10, decimals)
  );

  // For native MOVE tokens, use aptos_account::transfer_coins which automatically registers CoinStore
  // For fungible assets (other tokens), use primary_fungible_store::transfer
  const isNativeMove =
    selectedToken.isNative ||
    selectedToken.assetType === "0x1::aptos_coin::AptosCoin";

  let rawTxn;
  if (isNativeMove) {
    // Use aptos_account::transfer_coins for native MOVE - automatically registers CoinStore
    rawTxn = await aptos.transaction.build.simple({
      sender: senderAddress,
      data: {
        function: "0x1::aptos_account::transfer_coins",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [toAddress, amountInSmallestUnit],
      },
    });
  } else {
    // For fungible assets, use primary_fungible_store::transfer
    // The assetType is the fungible asset metadata address
    // Function signature: transfer<Metadata>(metadata_address: address, to: address, amount: u64)
    const assetType = selectedToken.assetType.trim();
    const recipientAddress = AccountAddress.fromString(toAddress);

    rawTxn = await aptos.transaction.build.simple({
      sender: senderAddress,
      data: {
        function: "0x1::primary_fungible_store::transfer",
        typeArguments: ["0x1::fungible_asset::Metadata"],
        functionArguments: [
          assetType,
          recipientAddress,
          amountInSmallestUnit,
        ],
      },
    });
  }

  const txnObj = rawTxn as unknown as Record<
    string,
    Record<string, unknown>
  >;
  if (txnObj.rawTransaction) {
    const chainIdObj = new ChainId(movementChainId);
    (txnObj.rawTransaction as Record<string, unknown>).chain_id = chainIdObj;
  }

  const message = generateSigningMessageForTransaction(rawTxn);
  const hash = toHex(message);

  const signatureResponse = await signRawHash({
    address: senderAddress,
    chainType: "aptos",
    hash: hash,
  });

  const publicKey = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
  const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
  const senderAuthenticator = new AccountAuthenticatorEd25519(publicKey, sig);

  const pending = await aptos.transaction.submit.simple({
    transaction: rawTxn,
    senderAuthenticator,
  });

  const executed = await aptos.waitForTransaction({
    transactionHash: pending.hash,
  });

  return executed.hash;
}

/**
 * Generates a user-friendly error message for transfer failures
 * @param error - The error that occurred
 * @param toAddress - The recipient address
 * @param selectedToken - The selected token
 * @returns User-friendly error message
 */
export function getTransferErrorMessage(
  error: unknown,
  toAddress: string,
  selectedToken: TokenBalance
): string {
  let errorMessage = "Transfer failed. Please try again.";

  if (error instanceof Error) {
    errorMessage = error.message;

    // Check for CoinStore errors
    if (
      error.message.includes("ECOIN_STORE_NOT_PUBLISHED") ||
      error.message.includes("CoinStore") ||
      error.message.includes("0x60005")
    ) {
      const isNativeMove =
        selectedToken.isNative ||
        selectedToken.assetType === "0x1::aptos_coin::AptosCoin";
      if (isNativeMove) {
        // For native MOVE, this shouldn't happen with aptos_account::transfer_coins
        errorMessage =
          `Transfer failed: The recipient address ${toAddress.slice(0, 10)}...${toAddress.slice(-8)} may not support automatic CoinStore registration. ` +
          `This can happen if the recipient is not a normal account type. ` +
          `Please verify the recipient address is correct and is a standard Aptos account.`;
      } else {
        // For other tokens, recipient needs to register CoinStore first
        errorMessage =
          `The recipient address ${toAddress.slice(0, 10)}...${toAddress.slice(-8)} has not registered a CoinStore for this token. ` +
          `The recipient needs to register their CoinStore before they can receive tokens. ` +
          `Please ask the recipient to register their CoinStore first, or use a different recipient address.`;
      }
    }
  }

  return errorMessage;
}

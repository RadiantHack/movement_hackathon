"use client";

import { useState, useMemo } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";

interface EchelonAsset {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  borrowApr: number;
  borrowCap: number;
  decimals?: number;
  market?: string;
  faAddress?: string; // Fungible asset address
}

interface EchelonBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: EchelonAsset | null;
  availableBalance?: number;
  inline?: boolean; // If true, renders inline without backdrop (for chat)
  onSuccess?: () => void; // Callback after successful transaction
}

// Echelon contract address
const ECHELON_CONTRACT =
  "0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5";

// Market addresses for each asset
const MARKET_ADDRESSES: Record<string, string> = {
  MOVE: "0x568f96c4ed010869d810abcf348f4ff6b66d14ff09672fb7b5872e4881a25db7",
  USDC: "0x789d7711b7979d47a1622692559ccd221ef7c35bb04f8762dadb5cc70222a0a0",
  USDT: "0x8191d4b8c0fc0af511b3c56c555528a3e74b7f3cfab3047df9ebda803f3bc3d2",
  WBTC: "0xa24e2eaacf9603538af362f44dfcf9d411363923b9206260474abfaa8abebee4",
  WETH: "0x6889932d2ff09c9d299e72b23a62a7f07af807789c98141d08475701e7b21b7c",
  LBTC: "0x62cb5f64b5a9891c57ff12d38fbab141e18c3d63e859a595ff6525b4221eaf23",
  SolvBTC: "0x185f42070ab2ca5910ebfdea83c9f26f4015ad2c0f5c8e6ca1566d07c6c60aca",
  ezETH: "0x8dd513b2bb41f0180f807ecaa1e0d2ddfacd57bf739534201247deca13f3542",
  sUSDe: "0x481fe68db505bc15973d0014c35217726efd6ee353d91a2a9faaac201f3423d",
  rsETH: "0x4cbeca747528f340ef9065c93dea0cc1ac8a46b759e31fc8b8d04bc52a86614b",
};

// Type arguments for each asset
const TYPE_ARGUMENTS: Record<string, string> = {
  MOVE: "0x1::aptos_coin::AptosCoin",
  USDC: "0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39",
  USDT: "0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d",
  WBTC: "0xb06f29f24dde9c6daeec1f930f14a441a8d6c0fbea590725e88b340af3e1939c",
  WETH: "0x908828f4fb0213d4034c3ded1630bbd904e8a3a6bf3c63270887f0b06653a376",
  LBTC: "0x658f4ef6f76c8eeffdc06a30946f3f06723a7f9532e2413312b2a612183759c",
  SolvBTC: "0x527c43638a6c389a9ad702e7085f31c48223624d5102a5207dfab861f482c46d",
  ezETH: "0x2f6af255328fe11b88d840d1e367e946ccd16bd7ebddd6ee7e2ef9f7ae0c53ef",
  sUSDe: "0x74f0c7504507f7357f8a218cc70ce3fc0f4b4e9eb8474e53ca778cb1e0c6dcc5",
  rsETH: "0x51ffc9885233adf3dd411078cad57535ed1982013dc82d9d6c433a55f2e0035d",
};

const MOVEMENT_RPC = "https://mainnet.movementnetwork.xyz/v1";
const MOVEMENT_CHAIN_ID = 126;

const aptos = new Aptos(
  new AptosConfig({
    network: Network.CUSTOM,
    fullnode: MOVEMENT_RPC,
  })
);

export function EchelonBorrowModal({
  isOpen,
  onClose,
  asset,
  availableBalance = 0,
  inline = false,
  onSuccess,
}: EchelonBorrowModalProps) {
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");

  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();

  const movementWallet = useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }
    return (
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          account.type === "wallet" && account.chainType === "aptos"
      ) || null
    );
  }, [user, ready, authenticated]);

  if (!isOpen || !asset) return null;

  const numericAmount = parseFloat(amount) || 0;
  const usdValue = numericAmount * asset.price;
  const rateLimit = 184608.6;
  const rateLimitMax = 500000;

  const handlePercentageChange = (pct: number) => {
    setPercentage(pct);
    const newAmount = (availableBalance * pct) / 100;
    setAmount(newAmount.toFixed(6));
    // Clear error when user changes percentage
    if (error) {
      setError(null);
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const num = parseFloat(value) || 0;
    const pct = availableBalance > 0 ? (num / availableBalance) * 100 : 0;
    setPercentage(Math.min(pct, 100));
    // Clear error when user changes amount
    if (error) {
      setError(null);
    }
  };

  const handleMax = () => {
    setAmount(availableBalance.toFixed(6));
    setPercentage(100);
  };

  const handlePresetPercentage = (pct: number) => {
    handlePercentageChange(pct);
  };

  const handleBorrow = async () => {
    console.log("[Borrow] handleBorrow called", {
      asset,
      numericAmount,
      availableBalance,
    });

    if (!asset || numericAmount <= 0) {
      console.log("[Borrow] Validation failed", {
        asset: !!asset,
        numericAmount,
      });
      setError("Please enter a valid amount to borrow");
      return;
    }

    if (!movementWallet) {
      console.log("[Borrow] No wallet connected");
      setError("Please connect a Movement wallet");
      return;
    }

    // Validate borrowing power before submitting
    if (availableBalance > 0 && numericAmount > availableBalance) {
      const errorMsg = `Insufficient borrowing power. You can borrow up to ${availableBalance.toFixed(6)} ${asset.symbol} based on your collateral.`;
      console.log("[Borrow] Borrowing power check failed", {
        numericAmount,
        availableBalance,
      });
      setError(errorMsg);
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      const senderAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;

      console.log("[Borrow] Wallet info", {
        senderAddress: !!senderAddress,
        publicKey: !!publicKey,
      });

      if (!senderAddress || !publicKey) {
        throw new Error("Wallet address or public key not found");
      }

      // Get market address and determine if it's a fungible asset
      const marketAddress = asset.market || MARKET_ADDRESSES[asset.symbol];
      // MOVE is a coin, everything else with faAddress is a fungible asset
      const isFungibleAsset = asset.symbol !== "MOVE" && !!asset.faAddress;

      console.log("[Borrow] Asset details", {
        symbol: asset.symbol,
        market: asset.market,
        marketAddress,
        faAddress: asset.faAddress,
        isFungibleAsset,
      });

      if (!marketAddress) {
        throw new Error(
          `Unsupported asset: ${asset.symbol}. Market address not found.`
        );
      }

      // Convert amount to smallest unit (8 decimals for most assets)
      // Use the same approach as supply modal for consistency
      const decimals = asset.decimals || 8;
      const maxU64 = BigInt("18446744073709551615"); // Maximum u64 value
      const maxAmount = Number(maxU64) / Math.pow(10, decimals);

      // Validate input amount first - ensure it's within safe range
      if (numericAmount > maxAmount) {
        throw new Error(
          `Amount too large. Maximum borrowable amount is ${maxAmount.toFixed(decimals)} ${asset.symbol}`
        );
      }

      if (numericAmount <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Use Math.floor like supply modal does, but validate the result
      // This works for amounts within JavaScript's safe integer range
      const multiplier = Math.pow(10, decimals);

      // Check if the calculation would exceed safe integer range
      if (numericAmount * multiplier > Number.MAX_SAFE_INTEGER) {
        throw new Error(`Amount too large. Please use a smaller amount.`);
      }

      const rawAmountNum = Math.floor(numericAmount * multiplier);

      // Validate the result is within u64 range
      const maxU64Num = Number(maxU64);
      if (rawAmountNum > maxU64Num || !Number.isSafeInteger(rawAmountNum)) {
        throw new Error(
          `Amount too large. Maximum borrowable amount is ${maxAmount.toFixed(decimals)} ${asset.symbol}`
        );
      }

      if (rawAmountNum <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Convert to string (Aptos SDK accepts string for u64)
      const rawAmount = rawAmountNum.toString();

      console.log("[Borrow] Amount conversion", {
        numericAmount,
        decimals,
        rawAmount,
        rawAmountNum,
        maxU64: maxU64.toString(),
        isValid: rawAmountNum <= Number(maxU64),
      });

      setStep("Building transaction...");

      // Build the transaction payload
      // Use borrow_fa for fungible assets, borrow for coins
      let functionName: `${string}::${string}::${string}`;
      let typeArguments: string[] | undefined = undefined;
      let functionArguments: any[];

      if (isFungibleAsset && asset.faAddress) {
        // For fungible assets, use borrow_fa (no type arguments needed)
        // Based on actual payload structure: borrow_fa takes Object<Market> and u64
        // The SDK will automatically wrap the address in Object format
        functionName =
          `${ECHELON_CONTRACT}::scripts::borrow_fa` as `${string}::${string}::${string}`;
        // borrow_fa params: &signer, Object<Market>, u64
        // Pass market address directly - SDK handles Object wrapping
        functionArguments = [marketAddress, rawAmount];
      } else {
        // For coins (like MOVE), use borrow with type argument
        const typeArgument = TYPE_ARGUMENTS[asset.symbol];
        if (!typeArgument) {
          throw new Error(
            `Unsupported asset: ${asset.symbol}. Type argument not found.`
          );
        }
        functionName =
          `${ECHELON_CONTRACT}::scripts::borrow` as `${string}::${string}::${string}`;
        typeArguments = [typeArgument];
        // borrow params: &signer, Object<Market>, u64
        functionArguments = [marketAddress, rawAmount];
      }

      console.log("[Borrow] Building transaction", {
        functionName,
        typeArguments,
        functionArguments,
        isFungibleAsset,
      });

      const transactionData: any = {
        function: functionName,
        functionArguments,
      };

      // Only add typeArguments if they exist (for coin types, not fungible assets)
      if (typeArguments && typeArguments.length > 0) {
        transactionData.typeArguments = typeArguments;
      }

      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: transactionData,
      });

      console.log("[Borrow] Transaction built successfully");

      // Override chain ID
      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
      }

      setStep("Waiting for signature...");

      // Generate signing message
      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      // Sign using Privy
      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash as `0x${string}`,
      });

      setStep("Submitting transaction...");

      // Create authenticator
      // Privy public key format: "004a4b8e35..." or "0x004a4b8e35..."
      // We need to drop the "00" prefix to get the actual 32-byte key
      let pubKeyNoScheme = publicKey.startsWith("0x")
        ? publicKey.slice(2)
        : publicKey;
      // Remove leading "00" if present (Privy adds this prefix)
      if (pubKeyNoScheme.startsWith("00") && pubKeyNoScheme.length > 64) {
        pubKeyNoScheme = pubKeyNoScheme.slice(2);
      }
      // Ensure we have exactly 64 hex characters (32 bytes)
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

      // Submit transaction
      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      setStep("Waiting for confirmation...");

      // Wait for transaction
      await aptos.waitForTransaction({
        transactionHash: pending.hash,
        options: { checkSuccess: true },
      });

      setTxHash(pending.hash);
      setStep("");

      // Call onSuccess callback to refresh data
      if (onSuccess) {
        onSuccess();
      }

      // Only close modal if not in inline mode (for chat, keep it open)
      if (!inline) {
        setTimeout(() => {
          onClose();
          setAmount("");
          setTxHash(null);
        }, 2000);
      } else {
        // In inline mode, just reset the amount but keep the card visible
        setTimeout(() => {
          setAmount("");
        }, 2000);
      }
    } catch (err: any) {
      console.error("[Borrow] Error occurred:", err);
      console.error("[Borrow] Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
        fullError: err,
      });

      // Parse Move abort errors for better user experience
      let errorMessage = err.message || "Transaction failed";

      // Check for Move abort errors
      if (errorMessage.includes("ERR_LENDING_INSUFFICIENT_BORROW_POWER")) {
        errorMessage =
          "Insufficient borrowing power. You don't have enough collateral to borrow this amount. Please supply more assets or reduce the borrow amount.";
      } else if (errorMessage.includes("Move abort")) {
        // Try to extract the error code and name
        const abortMatch = errorMessage.match(
          /Move abort in .*?::(\w+):\s*(\w+)\(0x([0-9a-fA-F]+)\)/
        );
        if (abortMatch) {
          const [, moduleName, errorName, errorCode] = abortMatch;
          if (errorName === "ERR_LENDING_INSUFFICIENT_BORROW_POWER") {
            errorMessage =
              "Insufficient borrowing power. You don't have enough collateral to borrow this amount. Please supply more assets or reduce the borrow amount.";
          } else {
            errorMessage = `Transaction failed: ${errorName} (Error code: 0x${errorCode}). Please check your collateral and try again.`;
          }
        }
      }

      // Check if error is from transaction wait
      if (
        errorMessage.includes("Transaction") &&
        errorMessage.includes("failed")
      ) {
        // Try to extract more details from the error
        const detailsMatch = errorMessage.match(/failed with an error: (.+)/);
        if (detailsMatch) {
          const details = detailsMatch[1];
          if (details.includes("ERR_LENDING_INSUFFICIENT_BORROW_POWER")) {
            errorMessage =
              "Insufficient borrowing power. You don't have enough collateral to borrow this amount. Please supply more assets or reduce the borrow amount.";
          }
        }
      }

      setError(errorMessage);
      setStep("");
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <div
      className={`${inline ? "w-full max-w-md mx-auto" : "relative w-full max-w-md"} rounded-3xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 ${inline ? "shadow-lg" : "shadow-2xl"} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
            Borrow
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Select the amount you&apos;d like to borrow
          </p>
        </div>
        {!inline && (
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all duration-200"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="px-6 pb-6">
        {/* Input Section */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/50 p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {asset.icon ? (
                  <img
                    src={
                      asset.icon.startsWith("/")
                        ? `https://app.echelon.market${asset.icon}`
                        : asset.icon
                    }
                    alt={asset.symbol}
                    className="w-12 h-12 rounded-full ring-2 ring-white dark:ring-zinc-800 shadow-lg"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center ring-2 ring-white dark:ring-zinc-800 shadow-lg">
                    <span className="text-white font-bold text-lg">
                      {asset.symbol.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.000000"
                  className="bg-transparent text-zinc-950 dark:text-zinc-50 text-2xl font-bold outline-none w-full placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                />
                <div className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5">
                  ≈ $
                  {usdValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <button
                onClick={handleMax}
                className="px-4 py-2 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
              >
                MAX
              </button>
              <div className="text-zinc-400 dark:text-zinc-500 text-xs mt-2">
                Available:{" "}
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                  {availableBalance.toFixed(6)}
                </span>{" "}
                {asset.symbol}
              </div>
            </div>
          </div>
        </div>

        {/* Percentage Presets */}
        <div className="flex gap-2 mb-4">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePresetPercentage(pct)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                percentage === pct
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="mb-6">
          <div className="relative h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full transition-all duration-200"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => handlePercentageChange(Number(e.target.value))}
            className="absolute w-full h-2 opacity-0 cursor-pointer"
            style={{ marginTop: "-8px" }}
          />
          <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 mt-2">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Stats */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/30 p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                />
              </svg>
              <span className="text-sm">Borrow APR</span>
              <svg
                className="w-3.5 h-3.5 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                <path
                  strokeLinecap="round"
                  strokeWidth={1.5}
                  d="M12 16v-4m0-4h.01"
                />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {asset.borrowApr.toFixed(2)}%
              </span>
              <span className="text-purple-400">✨</span>
            </div>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span className="text-sm">Origination Fee</span>
              <svg
                className="w-3.5 h-3.5 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                <path
                  strokeLinecap="round"
                  strokeWidth={1.5}
                  d="M12 16v-4m0-4h.01"
                />
              </svg>
            </div>
            <span className="text-zinc-950 dark:text-zinc-50 font-medium">
              0 {asset.symbol}
            </span>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm">Health factor</span>
              <svg
                className="w-3.5 h-3.5 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                <path
                  strokeLinecap="round"
                  strokeWidth={1.5}
                  d="M12 16v-4m0-4h.01"
                />
              </svg>
            </div>
            <span className="text-lg font-bold text-green-500">∞%</span>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="text-sm">Rate limit</span>
              <svg
                className="w-3.5 h-3.5 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                <path
                  strokeLinecap="round"
                  strokeWidth={1.5}
                  d="M12 16v-4m0-4h.01"
                />
              </svg>
            </div>
            <span className="text-zinc-950 dark:text-zinc-50 font-medium">
              {rateLimit.toLocaleString()} / {rateLimitMax.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Status Message - Shows error, success, or step in one place */}
        {(error || txHash || step) && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              error
                ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                : txHash
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                  : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
            }`}
          >
            {error ? (
              <div>{error}</div>
            ) : txHash ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">Transaction successful!</span>
                  <a
                    href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 underline font-semibold flex items-center gap-1"
                  >
                    View Transaction
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
                <div className="mt-2 text-xs font-mono text-green-600 dark:text-green-400 break-all">
                  {txHash}
                </div>
              </>
            ) : (
              <div>{step}</div>
            )}
          </div>
        )}

        {/* Borrow Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("[Borrow] Button clicked", {
              numericAmount,
              submitting,
              asset: asset?.symbol,
              disabled: numericAmount <= 0 || submitting,
            });
            if (numericAmount > 0 && !submitting) {
              handleBorrow();
            } else {
              console.log("[Borrow] Button click ignored - disabled state", {
                numericAmount,
                submitting,
              });
            }
          }}
          disabled={numericAmount <= 0 || submitting}
          className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 relative z-10 ${
            numericAmount > 0 && !submitting
              ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
          }`}
        >
          {submitting
            ? step || "Processing..."
            : numericAmount > 0
              ? `Borrow ${asset.symbol}`
              : "Enter amount to borrow"}
        </button>
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Modal */}
      {content}
    </div>
  );
}

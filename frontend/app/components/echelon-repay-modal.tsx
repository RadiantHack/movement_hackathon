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

interface RepayAsset {
  symbol: string;
  icon: string;
  price: number;
  decimals: number;
  amount: string;
  marketAddress: string;
  faAddress?: string; // Fungible asset address
}

interface EchelonRepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: RepayAsset | null;
  availableBalance?: number; // Available balance of the asset to repay with
  onSuccess?: () => void; // Callback after successful transaction
}

const ECHELON_CONTRACT =
  "0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5";

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

export function EchelonRepayModal({
  isOpen,
  onClose,
  asset,
  availableBalance = 0,
  onSuccess,
}: EchelonRepayModalProps) {
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

  // Debt amount (what the user owes)
  const debtAmount = parseFloat(asset.amount) / Math.pow(10, asset.decimals);
  // Available balance to repay with (what the user has)
  const availableToRepay = availableBalance || 0;
  // Maximum amount that can be repaid (min of debt and available balance)
  const maxRepayable = Math.min(debtAmount, availableToRepay);

  const numericAmount = parseFloat(amount) || 0;
  const usdValue = numericAmount * asset.price;

  const handlePercentageChange = (pct: number) => {
    setPercentage(pct);
    const newAmount = (maxRepayable * pct) / 100;
    setAmount(newAmount.toFixed(8));
    if (error) {
      setError(null);
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const num = parseFloat(value) || 0;
    const pct = maxRepayable > 0 ? (num / maxRepayable) * 100 : 0;
    setPercentage(Math.min(pct, 100));
    if (error) {
      setError(null);
    }
  };

  const handleMax = () => {
    setAmount(maxRepayable.toFixed(8));
    setPercentage(100);
  };

  const handlePresetPercentage = (pct: number) => {
    handlePercentageChange(pct);
  };

  const handleRepay = async () => {
    console.log("[Repay] handleRepay called", {
      asset,
      numericAmount,
      debtAmount,
      availableToRepay,
    });

    if (!asset || numericAmount <= 0) {
      console.log("[Repay] Validation failed", {
        asset: !!asset,
        numericAmount,
      });
      setError("Please enter a valid amount to repay");
      return;
    }

    if (!movementWallet) {
      console.log("[Repay] No wallet connected");
      setError("Please connect a Movement wallet");
      return;
    }

    // Validate amount doesn't exceed debt
    if (numericAmount > debtAmount) {
      setError(
        `Cannot repay more than the debt amount (${debtAmount.toFixed(6)} ${asset.symbol})`
      );
      return;
    }

    // Validate amount doesn't exceed available balance
    if (numericAmount > availableToRepay) {
      setError(
        `Insufficient balance. You have ${availableToRepay.toFixed(6)} ${asset.symbol} available.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      const senderAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;

      console.log("[Repay] Wallet info", {
        senderAddress: !!senderAddress,
        publicKey: !!publicKey,
      });

      if (!senderAddress || !publicKey) {
        throw new Error("Wallet address or public key not found");
      }

      // Determine if it's a fungible asset
      // MOVE is a coin, everything else with faAddress is a fungible asset
      const isFungibleAsset = asset.symbol !== "MOVE" && !!asset.faAddress;

      console.log("[Repay] Asset details", {
        symbol: asset.symbol,
        marketAddress: asset.marketAddress,
        faAddress: asset.faAddress,
        isFungibleAsset,
        debtAmount,
        numericAmount,
      });

      // Convert amount to smallest unit
      const rawAmount = Math.floor(
        numericAmount * Math.pow(10, asset.decimals)
      ).toString();

      console.log("[Repay] Amount conversion", {
        numericAmount,
        decimals: asset.decimals,
        rawAmount,
      });

      setStep("Building transaction...");

      // Use repay_all when repaying 100%, otherwise use repay with amount
      const isRepayAll = percentage >= 99.9;

      // Build the transaction payload
      // Use repay_fa/repay_all_fa for fungible assets, repay/repay_all for coins
      let functionName: `${string}::${string}::${string}`;
      let typeArguments: string[] | undefined = undefined;
      let functionArguments: any[];

      if (isFungibleAsset && asset.faAddress) {
        // For fungible assets, use repay_fa or repay_all_fa (no type arguments needed)
        functionName = isRepayAll
          ? (`${ECHELON_CONTRACT}::scripts::repay_all_fa` as `${string}::${string}::${string}`)
          : (`${ECHELON_CONTRACT}::scripts::repay_fa` as `${string}::${string}::${string}`);

        // repay_fa params: &signer, Object<Market>, u64
        // repay_all_fa params: &signer, Object<Market>
        // Pass market address directly - SDK handles Object wrapping
        functionArguments = isRepayAll
          ? [asset.marketAddress]
          : [asset.marketAddress, rawAmount];
      } else {
        // For coins (like MOVE), use repay or repay_all with type argument
        const typeArgument = TYPE_ARGUMENTS[asset.symbol];
        if (!typeArgument) {
          throw new Error(
            `Unsupported asset: ${asset.symbol}. Type argument not found.`
          );
        }
        functionName = isRepayAll
          ? (`${ECHELON_CONTRACT}::scripts::repay_all` as `${string}::${string}::${string}`)
          : (`${ECHELON_CONTRACT}::scripts::repay` as `${string}::${string}::${string}`);

        typeArguments = [typeArgument];
        // repay params: &signer, Object<Market>, u64
        // repay_all params: &signer, Object<Market>
        functionArguments = isRepayAll
          ? [asset.marketAddress]
          : [asset.marketAddress, rawAmount];
      }

      console.log("[Repay] Building transaction", {
        functionName,
        typeArguments,
        marketAddress: asset.marketAddress,
        functionArguments,
        isRepayAll,
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

      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
      }

      console.log("[Repay] Transaction built successfully");

      setStep("Waiting for signature...");

      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash as `0x${string}`,
      });

      setStep("Submitting transaction...");

      // Create authenticator
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

      // Close modal after a delay
      setTimeout(() => {
        onClose();
        setAmount("");
        setTxHash(null);
      }, 2000);
    } catch (err: any) {
      console.error("[Repay] Error occurred:", err);
      console.error("[Repay] Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
        fullError: err,
      });

      // Parse Move abort errors for better user experience
      let errorMessage = err.message || "Transaction failed";

      if (errorMessage.includes("Move abort")) {
        const abortMatch = errorMessage.match(
          /Move abort in .*?::(\w+):\s*(\w+)\(0x([0-9a-fA-F]+)\)/
        );
        if (abortMatch) {
          const [, moduleName, errorName, errorCode] = abortMatch;
          errorMessage = `Transaction failed: ${errorName} (Error code: 0x${errorCode}). Please check your balance and try again.`;
        }
      }

      setError(errorMessage);
      setStep("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
              Repay
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Repay your {asset.symbol} debt
            </p>
          </div>
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
                  Debt:{" "}
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {debtAmount.toFixed(6)}
                  </span>{" "}
                  {asset.symbol}
                </div>
                <div className="text-zinc-400 dark:text-zinc-500 text-xs">
                  Available:{" "}
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {availableToRepay.toFixed(6)}
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
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Current Debt
              </span>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {debtAmount.toFixed(6)} {asset.symbol}
              </span>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Repaying
              </span>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {numericAmount > 0 ? numericAmount.toFixed(6) : "0.000000"}{" "}
                {asset.symbol}
              </span>
            </div>
            <div className="h-px bg-zinc-200 dark:bg-zinc-700/50" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Remaining Debt
              </span>
              <span className="text-zinc-950 dark:text-zinc-50 font-medium">
                {Math.max(0, debtAmount - numericAmount).toFixed(6)}{" "}
                {asset.symbol}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Success Message */}
          {txHash && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400">
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
            </div>
          )}

          {/* Step Message */}
          {step && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
              {step}
            </div>
          )}

          {/* Repay Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("[Repay] Button clicked", {
                numericAmount,
                submitting,
                asset: asset?.symbol,
              });
              handleRepay();
            }}
            disabled={
              numericAmount <= 0 || submitting || numericAmount > maxRepayable
            }
            className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 ${
              numericAmount > 0 && !submitting && numericAmount <= maxRepayable
                ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            {submitting
              ? step || "Processing..."
              : numericAmount > 0
                ? `Repay ${asset.symbol}`
                : "Repay"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { useMovementConfig } from "../hooks/useMovementConfig";
import { Scanner } from "@yudiel/react-qr-scanner";
import { TokenBalance } from "../types";
import { useTransfer } from "../hooks/useTransfer";
import { useMovementWallet } from "../hooks/useMovementWallet";
import {
  validateMovementAddress,
  validateTransferAmount,
} from "../utils/transfer";
import { AssetIcon } from "./asset-icon";
import { TransactionSuccessMessage } from "./shared/TransactionSuccessMessage";

interface TransferFormProps {
  walletAddress: string;
  balances: TokenBalance[];
  initialToken?: TokenBalance | null;
  onTransferComplete?: () => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({
  walletAddress,
  balances,
  initialToken,
  onTransferComplete,
}) => {
  const config = useMovementConfig();
  const movementWallet = useMovementWallet();

  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasManuallySelectedToken = useRef(false);

  const aptos = useMemo(() => {
    if (!config.movementFullNode) return null;
    return new Aptos(
      new AptosConfig({
        network: Network.CUSTOM,
        fullnode: config.movementFullNode,
      })
    );
  }, [config.movementFullNode]);

  const movementChainId = useMemo(() => {
    return config.movementChainId || 126;
  }, [config.movementChainId]);

  // Use transfer hook for centralized transfer logic
  const {
    transferring,
    error: transferError,
    txHash,
    step: transferStep,
    handleTransfer,
  } = useTransfer({
    aptos,
    movementChainId,
    onSuccess: () => {
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        setAmount("");
        setToAddress("");
      }, 250);
      onTransferComplete?.();
    },
  });

  // Initialize token selection - only set if not already selected or when initialToken changes
  useEffect(() => {
    if (initialToken) {
      setSelectedToken(initialToken);
      hasManuallySelectedToken.current = false;
    } else if (balances.length > 0 && !hasManuallySelectedToken.current) {
      setSelectedToken((current) => {
        // Only set if no token is currently selected
        if (!current) {
          const nativeToken = balances.find((b) => b.isNative);
          return nativeToken || balances[0];
        }
        return current;
      });
    }
  }, [balances, initialToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setTokenDropdownOpen(false);
      }
    };

    if (tokenDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tokenDropdownOpen]);

  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    const parts = numericValue.split(".");
    const formattedValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : numericValue;
    setAmount(formattedValue);
  };

  const handleMax = () => {
    if (selectedToken) {
      setAmount(selectedToken.formattedAmount);
    }
  };

  const onTransferClick = async () => {
    if (!selectedToken) {
      return;
    }

    const success = await handleTransfer(selectedToken, toAddress, amount);
    if (success) {
      // Clear form on success
      setAmount("");
      setToAddress("");
    }
  };

  // Validate address and amount using centralized utilities
  const addressValidation = toAddress
    ? validateMovementAddress(toAddress)
    : { isValid: false };
  const amountValidation = amount
    ? validateTransferAmount(amount, selectedToken?.formattedAmount)
    : { isValid: false };

  const canTransfer =
    selectedToken &&
    amount &&
    amountValidation.isValid &&
    toAddress &&
    addressValidation.isValid &&
    !transferring &&
    !txHash;

  return (
    <div className="w-full">
      <div className="relative rounded-2xl overflow-hidden">
        {/* Enhanced background decoration */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br from-purple-500/15 via-violet-500/10 to-purple-500/15 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-tr from-violet-500/15 via-purple-500/10 to-violet-500/15 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "3s" }}
        />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-30" />

        <div className="space-y-5 sm:space-y-6 relative z-10 p-4 sm:p-5 md:p-6">
          {/* Header */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Transfer Tokens
              </h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                Movement Network
              </p>
            </div>
          </div>

          {/* Token Selection */}
          <div>
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              Select Token
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTokenDropdownOpen(!tokenDropdownOpen)}
                className="group w-full px-4 py-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm text-zinc-950 dark:text-zinc-50 outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 dark:focus:border-purple-500/60 transition-all duration-200 cursor-pointer font-medium text-left flex items-center gap-3 hover:border-purple-300/60 dark:hover:border-purple-600/60 hover:shadow-md hover:shadow-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={balances.length === 0}
              >
                {selectedToken ? (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden p-1">
                      <AssetIcon
                        symbol={selectedToken.metadata.symbol}
                        size="w-8 h-8"
                        className="rounded-lg"
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-semibold">
                        {selectedToken.metadata.symbol}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        Balance:{" "}
                        {parseFloat(
                          selectedToken.formattedAmount
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Select a token
                  </span>
                )}
                <svg
                  className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ml-auto ${
                    tokenDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {tokenDropdownOpen && (
                <div
                  ref={dropdownRef}
                  className="absolute z-20 mt-2 w-full rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-zinc-900/10 dark:shadow-zinc-950/50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  {balances.map((balance) => {
                    const balanceAmount = parseFloat(balance.formattedAmount);
                    return (
                      <button
                        key={balance.assetType}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          hasManuallySelectedToken.current = true;
                          setSelectedToken(balance);
                          setTokenDropdownOpen(false);
                          setAmount("");
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className={`group w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/60 transition-all duration-200 cursor-pointer ${
                          selectedToken?.assetType === balance.assetType
                            ? "bg-gradient-to-r from-purple-50/80 via-violet-50/60 to-purple-50/80 dark:from-purple-950/50 dark:via-violet-950/40 dark:to-purple-950/50"
                            : ""
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden p-1">
                          <AssetIcon
                            symbol={balance.metadata.symbol}
                            size="w-8 h-8"
                            className="rounded-lg"
                          />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                            {balance.metadata.symbol}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {balanceAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 6,
                            })}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              Amount
            </label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 dark:focus:border-purple-500/60 transition-all duration-200 text-lg sm:text-xl font-bold hover:border-purple-300/60 dark:hover:border-purple-600/60 hover:shadow-md hover:shadow-purple-500/10"
                disabled={!selectedToken || transferring || !!txHash}
              />
              {selectedToken && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={handleMax}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-900/40 dark:to-violet-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase tracking-wider hover:from-purple-200 hover:to-violet-200 dark:hover:from-purple-800/50 dark:hover:to-violet-800/50 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                    disabled={transferring || !!txHash}
                  >
                    MAX
                  </button>
                </div>
              )}
            </div>
            {selectedToken && (
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Balance:{" "}
                {parseFloat(selectedToken.formattedAmount).toLocaleString(
                  undefined,
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  }
                )}{" "}
                {selectedToken.metadata.symbol}
              </div>
            )}
          </div>

          {/* Recipient Address */}
          <div>
            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2.5 sm:mb-3">
              Recipient Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3.5 pr-12 sm:pr-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 bg-gradient-to-br from-zinc-50/80 to-white dark:from-zinc-800/60 dark:to-zinc-900/80 backdrop-blur-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/60 dark:focus:border-purple-500/60 transition-all duration-200 font-mono text-sm hover:border-purple-300/60 dark:hover:border-purple-600/60 hover:shadow-md hover:shadow-purple-500/10"
                disabled={transferring || !!txHash}
              />
              {/* QR Scanner Button - Only visible on mobile */}
              <button
                type="button"
                onClick={() => setShowQRScanner(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 sm:hidden p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                disabled={transferring || !!txHash}
                title="Scan QR Code"
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
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Movement Network address (66 characters)
            </div>
          </div>

          {/* QR Scanner Modal */}
          {showQRScanner && (
            <QRScannerModal
              onScanSuccess={(address) => {
                setToAddress(address);
                setShowQRScanner(false);
              }}
              onClose={() => setShowQRScanner(false)}
            />
          )}

          {/* Error Message */}
          {transferError && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-red-50/90 to-red-100/70 dark:from-red-900/30 dark:to-red-950/40 border border-red-200/80 dark:border-red-800/60 backdrop-blur-sm text-red-700 dark:text-red-400 text-sm shadow-sm">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-medium flex-1">{transferError}</span>
              </div>
            </div>
          )}

          {/* Success Message */}
          {txHash && showSuccessMessage && (
            <TransactionSuccessMessage txHash={txHash} />
          )}

          {/* Transfer Button */}
          <button
            onClick={onTransferClick}
            disabled={!canTransfer}
            className={`relative w-full py-4 rounded-xl font-bold text-base transition-all duration-300 overflow-hidden group ${
              canTransfer
                ? "bg-gradient-to-r from-purple-600 via-violet-600 to-purple-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
            }`}
          >
            {canTransfer && (
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {transferring ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {transferStep || "Transferring..."}
                </>
              ) : txHash ? (
                "Transfer Complete"
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  Transfer
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// QR Scanner Modal Component
interface QRScannerModalProps {
  onScanSuccess: (address: string) => void;
  onClose: () => void;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({
  onScanSuccess,
  onClose,
}) => {
  const [error, setError] = useState<string | null>(null);

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const result = detectedCodes[0].rawValue || detectedCodes[0].text || "";
      // Validate the scanned address
      const address = result.trim();
      const validation = validateMovementAddress(address);
      if (validation.isValid) {
        onScanSuccess(address);
        onClose(); // Close modal after successful scan
      } else {
        setError(
          validation.error ||
            "Invalid address format. Please scan a valid Movement Network address (66 characters starting with 0x)."
        );
      }
    }
  };

  const handleError = (error: unknown) => {
    console.error("QR Scanner error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("NotAllowedError") ||
      errorMessage.includes("Permission denied")
    ) {
      setError(
        "Camera permission denied. Please allow camera access in Safari settings: Settings → Safari → Camera → Allow."
      );
    } else if (errorMessage.includes("NotReadableError")) {
      setError(
        "Camera is being used by another application. Please close other apps using the camera."
      );
    } else if (
      errorMessage.includes("NotFoundError") ||
      errorMessage.includes("no camera")
    ) {
      setError("No camera found on this device.");
    } else {
      setError(
        `Camera error: ${errorMessage}. Please ensure camera permissions are granted.`
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-2xl animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Scan QR Code
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
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

        {/* Scanner Container */}
        <div className="p-4">
          <div
            className="w-full rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800"
            style={{ minHeight: "300px", position: "relative" }}
          >
            <div className="relative w-full" style={{ minHeight: "300px" }}>
              <Scanner
                onScan={handleScan}
                onError={handleError}
                constraints={{
                  facingMode: "environment", // Use back camera
                }}
                formats={["qr_code"]}
                styles={{
                  container: {
                    width: "100%",
                    height: "100%",
                  },
                  video: {
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  },
                }}
              />
              {/* Scanning overlay with indicator */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-purple-500 rounded-lg shadow-lg" />
              </div>
              {/* Scan-only indicator */}
              <div className="absolute top-2 left-2 bg-green-500/90 text-white text-[10px] font-semibold px-2 py-1 rounded">
                SCANNING
              </div>
            </div>
          </div>
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <p className="mt-4 text-xs text-center text-zinc-500 dark:text-zinc-400">
            📷 Camera is active for scanning only (not recording)
          </p>
          <p className="mt-2 text-xs text-center text-zinc-500 dark:text-zinc-400">
            Point your camera at a QR code containing a Movement Network address
          </p>
        </div>
      </div>
    </div>
  );
};

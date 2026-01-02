"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import {
  Aptos,
  AptosConfig,
  Network,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  ChainId,
  AccountAddress,
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useMovementConfig } from "../hooks/useMovementConfig";
import { Html5Qrcode } from "html5-qrcode";

interface TokenBalance {
  assetType: string;
  amount: string;
  formattedAmount: string;
  metadata: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isNative: boolean;
}

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
  const { signRawHash } = useSignRawHash();
  const { user, ready, authenticated } = usePrivy();
  const config = useMovementConfig();

  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
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

  const handleTransfer = async () => {
    if (!movementWallet || !selectedToken) {
      setTransferError("Please select a token and ensure wallet is connected.");
      return;
    }

    if (!ready || !authenticated) {
      setTransferError("Please authenticate first.");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setTransferError("Please enter a valid amount.");
      return;
    }

    if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 66) {
      setTransferError(
        "Please enter a valid recipient address (66 characters, starting with 0x)."
      );
      return;
    }

    setTransferring(true);
    setTransferError(null);
    setTxHash(null);

    try {
      if (!aptos) {
        throw new Error("Aptos client not initialized");
      }

      const aptosWallet = user?.linkedAccounts?.find((a: unknown) => {
        const account = a as Record<string, unknown>;
        return account.type === "wallet" && account.chainType === "aptos";
      }) as WalletWithMetadata | undefined;

      if (!aptosWallet) {
        throw new Error("Aptos wallet not found");
      }

      const senderAddress = aptosWallet.address as string;
      const senderPubKeyWithScheme = aptosWallet.publicKey as string;

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
        (txnObj.rawTransaction as Record<string, unknown>).chain_id =
          chainIdObj;
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
      const senderAuthenticator = new AccountAuthenticatorEd25519(
        publicKey,
        sig
      );

      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      const executed = await aptos.waitForTransaction({
        transactionHash: pending.hash,
      });

      setTxHash(executed.hash);
      onTransferComplete?.();
    } catch (err: unknown) {
      console.error("Transfer error:", err);
      let errorMessage = "Transfer failed. Please try again.";

      if (err instanceof Error) {
        errorMessage = err.message;

        // Check for CoinStore errors
        if (
          err.message.includes("ECOIN_STORE_NOT_PUBLISHED") ||
          err.message.includes("CoinStore") ||
          err.message.includes("0x60005")
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

      setTransferError(errorMessage);
    } finally {
      setTransferring(false);
    }
  };

  const canTransfer =
    selectedToken &&
    amount &&
    parseFloat(amount) > 0 &&
    toAddress &&
    toAddress.startsWith("0x") &&
    toAddress.length === 66 &&
    !transferring &&
    !txHash;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
          <svg
            className="h-6 w-6 text-white"
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
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Transfer Tokens
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Movement Network
          </p>
        </div>
      </div>

      {/* Token Selection */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Select Token
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setTokenDropdownOpen(!tokenDropdownOpen)}
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all cursor-pointer font-medium text-left flex items-center gap-3"
          >
            {selectedToken ? (
              <>
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedToken.isNative
                      ? "bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`text-sm font-bold ${
                      selectedToken.isNative
                        ? "text-purple-700 dark:text-purple-300"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {selectedToken.metadata.symbol.length <= 4
                      ? selectedToken.metadata.symbol
                      : selectedToken.metadata.symbol.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold">
                    {selectedToken.metadata.symbol}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Balance:{" "}
                    {parseFloat(selectedToken.formattedAmount).toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      }
                    )}
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
              className="absolute z-20 mt-2 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden max-h-60 overflow-y-auto"
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
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                      selectedToken?.assetType === balance.assetType
                        ? "bg-purple-50 dark:bg-purple-900/20"
                        : ""
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        balance.isNative
                          ? "bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30"
                          : "bg-zinc-200 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          balance.isNative
                            ? "text-purple-700 dark:text-purple-300"
                            : "text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {balance.metadata.symbol.length <= 4
                          ? balance.metadata.symbol
                          : balance.metadata.symbol.charAt(0)}
                      </span>
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
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Amount
        </label>
        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.0"
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-lg font-semibold"
            disabled={!selectedToken || transferring || !!txHash}
          />
          {selectedToken && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleMax}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
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
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Recipient Address
        </label>
        <div className="relative">
          <input
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 pr-12 sm:pr-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono text-sm"
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
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {transferError}
        </div>
      )}

      {/* Success Message */}
      {txHash && (
        <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-sm text-green-700 dark:text-green-400">
          <div className="flex items-center gap-3">
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
            <span className="font-medium">Transfer successful!</span>
            <a
              href={`https://explorer.movementnetwork.xyz/txn/${txHash}?network=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-green-600 dark:text-green-400 hover:underline font-semibold"
            >
              View →
            </a>
          </div>
        </div>
      )}

      {/* Transfer Button */}
      <button
        onClick={handleTransfer}
        disabled={!canTransfer}
        className={`w-full py-3.5 rounded-lg font-semibold transition-all duration-300 ${
          canTransfer
            ? "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg active:scale-95"
            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
        }`}
      >
        {transferring
          ? "Transferring..."
          : txHash
            ? "Transfer Complete"
            : "Transfer"}
      </button>
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
  const [isScanning, setIsScanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = useRef(`qr-reader-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const startScanning = async () => {
      try {
        // Check if camera is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError("Camera API not available. Please use HTTPS or a modern browser.");
          setIsInitializing(false);
          return;
        }

        const html5QrCode = new Html5Qrcode(containerId.current);
        scannerRef.current = html5QrCode;

        // For iOS PWA, we need to enumerate cameras first
        let cameraId: string | null = null;
        let cameras: any[] = [];
        
        try {
          cameras = await Html5Qrcode.getCameras();
          console.log("Available cameras:", cameras);
          
          if (cameras && cameras.length > 0) {
            // On iOS, cameras might not have descriptive labels
            // Try to find back camera - on iOS it's usually the second camera or has specific characteristics
            // iOS typically has: front camera (index 0) and back camera (index 1)
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            
            if (isIOS && cameras.length > 1) {
              // On iOS, back camera is usually the second one
              cameraId = cameras[1].id;
              console.log("Using iOS back camera:", cameraId);
            } else {
              // Try to find by label
              const backCamera = cameras.find(device => {
                const label = device.label.toLowerCase();
                return label.includes("back") || 
                       label.includes("rear") ||
                       label.includes("environment") ||
                       label.includes("facing: back");
              });
              cameraId = backCamera?.id || cameras[cameras.length - 1].id; // Use last camera as fallback (often back camera)
            }
          }
        } catch (err) {
          console.log("Could not enumerate cameras, will use facingMode:", err);
        }

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false,
        };

        // Try with cameraId first, then fallback to facingMode
        let started = false;
        
        if (cameraId) {
          try {
            await html5QrCode.start(
              cameraId,
              config,
              (decodedText) => {
                // Validate the scanned address
                const address = decodedText.trim();
                if (address.startsWith("0x") && address.length === 66) {
                  html5QrCode.stop().catch(console.error);
                  onScanSuccess(address);
                } else {
                  setError("Invalid address format. Please scan a valid Movement Network address (66 characters starting with 0x).");
                }
              },
              (errorMessage) => {
                // Ignore scanning errors during normal operation
                if (errorMessage && (
                  errorMessage.includes("NotAllowedError") ||
                  errorMessage.includes("NotReadableError") ||
                  errorMessage.includes("NotFoundError")
                )) {
                  console.error("Camera error:", errorMessage);
                }
              }
            );
            started = true;
          } catch (err) {
            console.log("Failed to start with cameraId, trying facingMode:", err);
          }
        }

        // Fallback to facingMode if cameraId didn't work
        if (!started) {
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              // Validate the scanned address
              const address = decodedText.trim();
              if (address.startsWith("0x") && address.length === 66) {
                html5QrCode.stop().catch(console.error);
                onScanSuccess(address);
              } else {
                setError("Invalid address format. Please scan a valid Movement Network address (66 characters starting with 0x).");
              }
            },
            (errorMessage) => {
              // Ignore scanning errors during normal operation
              if (errorMessage && (
                errorMessage.includes("NotAllowedError") ||
                errorMessage.includes("NotReadableError") ||
                errorMessage.includes("NotFoundError")
              )) {
                console.error("Camera error:", errorMessage);
              }
            }
          );
        }

        setIsScanning(true);
        setIsInitializing(false);
        setError(null);
      } catch (err) {
        console.error("QR Scanner error:", err);
        setIsInitializing(false);
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (errorMessage.includes("NotAllowedError") || errorMessage.includes("Permission denied")) {
          setError("Camera permission denied. Please allow camera access in Safari settings: Settings → Safari → Camera → Allow.");
        } else if (errorMessage.includes("NotReadableError")) {
          setError("Camera is being used by another application. Please close other apps using the camera.");
        } else if (errorMessage.includes("NotFoundError") || errorMessage.includes("no camera")) {
          setError("No camera found on this device.");
        } else if (errorMessage.includes("OverconstrainedError")) {
          setError("Camera constraints not supported. Trying alternative camera...");
          // Try front camera as last resort
          try {
            const html5QrCode = scannerRef.current;
            if (html5QrCode) {
              await html5QrCode.start(
                { facingMode: "user" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                  const address = decodedText.trim();
                  if (address.startsWith("0x") && address.length === 66) {
                    html5QrCode.stop().catch(console.error);
                    onScanSuccess(address);
                  }
                },
                () => {}
              );
              setIsScanning(true);
              setIsInitializing(false);
              setError(null);
              return;
            }
          } catch (fallbackErr) {
            setError("Failed to access camera. Please check permissions and try again.");
          }
        } else {
          setError(`Failed to start camera: ${errorMessage}. Please ensure camera permissions are granted.`);
        }
      }
    };

    startScanning();

    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current = null;
          })
          .catch((err) => {
            console.error("Error stopping scanner:", err);
            scannerRef.current = null;
          });
      }
    };
  }, [onScanSuccess]);

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
          <div className="w-full rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800" style={{ minHeight: "300px", position: "relative" }}>
            {isInitializing && !error && (
              <div className="flex items-center justify-center h-[300px]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Initializing camera...</p>
                </div>
              </div>
            )}
            <div
              id={containerId.current}
              className="w-full"
              style={{ minHeight: "300px", display: isInitializing ? "none" : "block" }}
            />
            {/* Scanning overlay */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-purple-500 rounded-lg shadow-lg" />
              </div>
            )}
          </div>
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <p className="mt-4 text-xs text-center text-zinc-500 dark:text-zinc-400">
            Point your camera at a QR code containing a Movement Network address
          </p>
        </div>
      </div>
    </div>
  );
};

"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
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
} from "@aptos-labs/ts-sdk";
import { toHex } from "viem";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useMovementConfig } from "../../hooks/useMovementConfig";
import { getTokenIconUrl } from "../../utils/token-icons";

const MOVEMENT_CHAIN = {
  id: "movement",
  name: "Movement",
  symbol: "MOVE",
};

const ETHEREUM_CHAIN = {
  id: "ethereum",
  name: "Ethereum",
  symbol: "ETH",
};

const TOKENS = [
  { symbol: "MOVE", name: "Move Coin" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "USDT", name: "Tether USD" },
  { symbol: "WETH", name: "Wrapped ETH" },
  { symbol: "WBTC", name: "Wrapped BTC" },
];

interface BridgeFormProps {
  walletAddress?: string | null;
}

export default function BridgeForm({ walletAddress }: BridgeFormProps) {
  const { user, ready, authenticated } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const config = useMovementConfig();

  const [token, setToken] = useState("MOVE");
  const [amount, setAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [bridging, setBridging] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number>(8);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

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
    if (!ready || !authenticated || !user?.linkedAccounts) return null;
    return (
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          account.type === "wallet" && account.chainType === "aptos"
      ) || null
    );
  }, [user, ready, authenticated]);

  useEffect(() => {
    if (!walletAddress || !token) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        const response = await fetch(
          `/api/balance?address=${encodeURIComponent(walletAddress)}`
        );
        if (!response.ok) throw new Error("Failed to fetch balance");
        const data = await response.json();
        if (data.success && data.balances && data.balances.length > 0) {
          const normalizedToken = token.toUpperCase().replace(/\./g, "").trim();
          const tokenBalance = data.balances.find((b: any) => {
            const normalizedSymbol = b.metadata.symbol
              .toUpperCase()
              .replace(/\./g, "")
              .trim();
            return (
              normalizedSymbol === normalizedToken ||
              normalizedSymbol.startsWith(normalizedToken) ||
              normalizedToken.startsWith(normalizedSymbol)
            );
          });
          if (tokenBalance) {
            setBalance(tokenBalance.formattedAmount);
            setTokenDecimals(tokenBalance.metadata.decimals || 8);
          } else {
            setBalance("0.000000");
            setTokenDecimals(8);
          }
        } else {
          setBalance("0.000000");
        }
      } catch (err) {
        console.error("Error fetching balance:", err);
        setBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress, token]);

  const addressToBytes32 = (address: string): Uint8Array => {
    const addr = address.startsWith("0x") ? address.slice(2) : address;
    const addressBytes = new Uint8Array(20);
    for (let i = 0; i < addr.length; i += 2) {
      addressBytes[i / 2] = parseInt(addr.substr(i, 2), 16);
    }
    const bytes32 = new Uint8Array(32);
    bytes32.set(addressBytes, 12);
    return bytes32;
  };

  const isValidEthereumAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const handleBridge = async () => {
    if (!recipientAddress || !isValidEthereumAddress(recipientAddress)) return;
    if (!walletAddress || !movementWallet || !aptos) return;

    setBridging(true);
    try {
      const senderAddress = walletAddress;
      const senderPubKeyWithScheme = movementWallet.publicKey as string;
      if (!senderPubKeyWithScheme || senderPubKeyWithScheme.length < 2) {
        throw new Error("Invalid public key format");
      }
      const pubKeyNoScheme = senderPubKeyWithScheme.slice(2);

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error("Invalid amount");
      const amountLd = BigInt(Math.floor(parsedAmount * Math.pow(10, tokenDecimals)));
      const minAmountLd = amountLd;

      const dstEid = 30101;
      const toBytes32 = addressToBytes32(recipientAddress);
      const toVector = Array.from(toBytes32).map((b) => b.toString());

      const extraOptionsHex = "0x00030100110100000000000000000000000000061a80";
      const extraOptionsBytes = Buffer.from(extraOptionsHex.slice(2), "hex");
      const extraOptionsVector = Array.from(extraOptionsBytes).map((b) => b.toString());

      const composeMessageHex = "0x00";
      const composeMessageBytes = Buffer.from(composeMessageHex.slice(2), "hex");
      const composeMessageVector = Array.from(composeMessageBytes).map((b) => b.toString());

      const oftCmdHex = "0x00";
      const oftCmdBytes = Buffer.from(oftCmdHex.slice(2), "hex");
      const oftCmdVector = Array.from(oftCmdBytes).map((b) => b.toString());

      const nativeFee = BigInt(481762913);
      const zroFee = BigInt(0);

      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function:
            "0x4d2969d384e440db9f1a51391cfc261d1ec08ee1bdf7b9711a6c05d485a4110a::oft::send_withdraw_coin",
          typeArguments: [],
          functionArguments: [
            dstEid.toString(),
            toVector,
            amountLd.toString(),
            minAmountLd.toString(),
            extraOptionsVector,
            composeMessageVector,
            oftCmdVector,
            nativeFee.toString(),
            zroFee.toString(),
          ],
        },
      });

      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        const chainIdObj = new ChainId(movementChainId);
        txnObj.rawTransaction.chain_id = chainIdObj;
      }

      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash as `0x${string}`,
      });

      const publicKey = new Ed25519PublicKey(`0x${pubKeyNoScheme}`);
      const sig = new Ed25519Signature(signatureResponse.signature.slice(2));
      const senderAuthenticator = new AccountAuthenticatorEd25519(publicKey, sig);

      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      const executed = await aptos.waitForTransaction({ transactionHash: pending.hash });

      alert(`Bridge transaction successful! Hash: ${executed.hash}`);
      setAmount("");
      setRecipientAddress("");
    } catch (error) {
      console.error("Bridge error:", error);
      const errorMessage = error instanceof Error ? error.message : "Bridge failed. Please try again.";
      alert(`Bridge failed: ${errorMessage}`);
    } finally {
      setBridging(false);
    }
  };

  const selectedToken = TOKENS.find((t) => t.symbol === token) || TOKENS[0];

  const tokenItems = TOKENS.map((t) => {
    const iconUrl = getTokenIconUrl(t.symbol);
    return (
      <button
        key={t.symbol}
        onClick={() => {
          setToken(t.symbol);
          setShowTokenDropdown(false);
        }}
        className={`w-full flex items-center gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
          token === t.symbol ? "bg-blue-50 dark:bg-blue-900/20" : ""
        }`}
      >
        <div className="relative w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden">
          {iconUrl ? <img src={iconUrl as string} alt={t.symbol} className="w-10 h-10 object-contain p-1" /> : null}
        </div>
        <div className="text-left flex-1">
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{t.symbol}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.name}</div>
        </div>
        {token === t.symbol && (
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    );
  });

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div className="relative rounded-2xl p-6 sm:p-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700/50 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
        <div className="relative flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 via-amber-500 to-blue-500 shadow-lg shadow-yellow-500/30">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Bridge to Ethereum</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Transfer assets from Movement Network</p>
          </div>
        </div>

        <div className="relative mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Select Token</label>
          <div className="relative">
            <button
              onClick={() => setShowTokenDropdown(!showTokenDropdown)}
              disabled={bridging}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden">
                  {(() => {
                    const iconUrl = getTokenIconUrl(selectedToken.symbol);
                    if (iconUrl) {
                      return (
                        <img src={iconUrl as string} alt={selectedToken.symbol} className="w-10 h-10 object-contain p-1" />
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{selectedToken.symbol}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{selectedToken.name}</div>
                </div>
              </div>
              <svg className={`w-5 h-5 text-zinc-400 transition-transform ${showTokenDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTokenDropdown && (
              <div className="absolute z-20 w-full mt-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
                {tokenItems}
              </div>
            )}
          </div>
        </div>

        <div className="relative mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Amount</label>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "");
                  setAmount(val);
                }}
                placeholder="0.0"
                className="flex-1 min-w-0 bg-transparent text-2xl font-bold text-zinc-900 dark:text-zinc-50 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none"
                disabled={bridging}
              />
              <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-2">{selectedToken.symbol}</div>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                {loadingBalance ? (
                  <span className="flex items-center gap-1">Loading...</span>
                ) : (
                  `Balance: ${balance ? parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "0.00"} ${selectedToken.symbol}`
                )}
              </span>
              <button
                onClick={() => {
                  if (balance) setAmount(balance);
                }}
                className="text-xs font-bold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={bridging || !balance || parseFloat(balance || "0") === 0}
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Recipient (Ethereum)</label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
            disabled={bridging}
          />
        </div>

        <div className="mt-4">
          <button
            onClick={handleBridge}
            disabled={!(amount && parseFloat(amount) > 0 && !bridging && recipientAddress && isValidEthereumAddress(recipientAddress))}
            className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {bridging ? "Bridging..." : "Bridge"}
          </button>
        </div>
      </div>
    </div>
  );
}

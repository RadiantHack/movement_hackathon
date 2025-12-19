"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import { ThemeToggle } from "../components/themeToggle";
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

const MOVEMENT_RPC = "https://mainnet.movementnetwork.xyz/v1";
const MOVEMENT_CHAIN_ID = 126;

const aptos = new Aptos(
  new AptosConfig({
    network: Network.CUSTOM,
    fullnode: MOVEMENT_RPC,
  })
);

const TOKENS = [
  { symbol: "MOVE", name: "Move Coin", decimals: 8, coinType: "0x1::aptos_coin::AptosCoin", isCoin: true },
  { symbol: "USDC", name: "USD Coin", decimals: 6, coinType: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC", isCoin: true },
  { symbol: "USDT", name: "Tether", decimals: 6, coinType: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT", isCoin: true },
];

export default function TransferPage() {
  const { ready, authenticated, user } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);

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

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  const fetchBalances = async () => {
    if (!movementWallet?.address) {
      setLoadingBalances(false);
      return;
    }
    setLoadingBalances(true);
    try {
      const res = await fetch(`/api/balance?address=${encodeURIComponent(movementWallet.address)}`);
      const data = await res.json();
      if (data.success && data.balances) {
        const newBalances: Record<string, string> = {};
        for (const token of TOKENS) {
          const found = data.balances.find((b: any) => 
            b.metadata?.symbol?.toUpperCase() === token.symbol.toUpperCase()
          );
          newBalances[token.symbol] = found ? found.formattedAmount : "0";
        }
        setBalances(newBalances);
      }
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [movementWallet?.address]);

  const handleTransfer = async () => {
    if (!recipient || !amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid recipient and amount");
      return;
    }

    if (!movementWallet) {
      setError("Please connect a Movement wallet");
      return;
    }

    setSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      const senderAddress = movementWallet.address as string;
      const publicKey = (movementWallet as any).publicKey as string;

      if (!senderAddress || !publicKey) {
        throw new Error("Wallet address or public key not found");
      }

      const rawAmount = Math.floor(parseFloat(amount) * Math.pow(10, selectedToken.decimals)).toString();

      setStep("Building transaction...");

      const rawTxn = await aptos.transaction.build.simple({
        sender: senderAddress,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: [selectedToken.coinType],
          functionArguments: [recipient, rawAmount],
        },
      });

      const txnObj = rawTxn as any;
      if (txnObj.rawTransaction) {
        txnObj.rawTransaction.chain_id = new ChainId(MOVEMENT_CHAIN_ID);
      }

      setStep("Waiting for signature...");

      const message = generateSigningMessageForTransaction(rawTxn);
      const hash = toHex(message);

      const signatureResponse = await signRawHash({
        address: senderAddress,
        chainType: "aptos",
        hash: hash as `0x${string}`,
      });

      setStep("Submitting transaction...");

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

      const pending = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator,
      });

      setStep("Waiting for confirmation...");

      await aptos.waitForTransaction({
        transactionHash: pending.hash,
        options: { checkSuccess: true },
      });

      setTxHash(pending.hash);
      setStep("");
      setAmount("");
      setRecipient("");
      // Refresh balances without showing loader
      if (movementWallet?.address) {
        const res = await fetch(`/api/balance?address=${encodeURIComponent(movementWallet.address)}`);
        const data = await res.json();
        if (data.success && data.balances) {
          const newBalances: Record<string, string> = {};
          for (const token of TOKENS) {
            const found = data.balances.find((b: any) => 
              b.metadata?.symbol?.toUpperCase() === token.symbol.toUpperCase()
            );
            newBalances[token.symbol] = found ? found.formattedAmount : "0";
          }
          setBalances(newBalances);
        }
      }

    } catch (err: any) {
      console.error("Transfer error:", err);
      setError(err.message || "Transaction failed");
      setStep("");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Transfer</h1>
          <button
            onClick={() => setRightSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>

        <div className="hidden border-b border-zinc-200 dark:border-zinc-800 md:block">
          <div className="flex items-center justify-between px-8 py-4">
            <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Transfer Tokens</h1>
            <ThemeToggle />
          </div>
        </div>

        <div className="p-4 md:p-8">
          <div className="mx-auto max-w-lg">
            {loadingBalances ? (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex items-center justify-center min-h-[300px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-purple-600 dark:border-zinc-700 dark:border-t-purple-400" />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading balances...</span>
                </div>
              </div>
            ) : (
            <div className="relative rounded-3xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 p-8 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden">
              {/* Background decoration */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-violet-500/10 rounded-full blur-3xl" />
              
              {/* Header */}
              <div className="relative mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Send Tokens</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Transfer to any address</p>
                </div>
              </div>

              {/* Token Selection */}
              <div className="relative mb-6">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Select Token
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTokenDropdownOpen(!tokenDropdownOpen)}
                    className="w-full px-5 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-950 dark:text-zinc-50 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all cursor-pointer font-medium text-left flex items-center gap-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white font-bold text-sm shadow-lg shadow-purple-500/20">
                      {selectedToken.symbol.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{selectedToken.symbol}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{selectedToken.name}</div>
                    </div>
                    <svg className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${tokenDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {tokenDropdownOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 shadow-2xl shadow-zinc-200/50 dark:shadow-zinc-950/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      {(TOKENS.filter((token) => parseFloat(balances[token.symbol] || "0") > 0).length > 0
                        ? TOKENS.filter((token) => parseFloat(balances[token.symbol] || "0") > 0)
                        : TOKENS
                      ).map((token) => (
                        <button
                          key={token.symbol}
                          type="button"
                          onClick={() => {
                            setSelectedToken(token);
                            setTokenDropdownOpen(false);
                          }}
                          className={`w-full px-5 py-4 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                            selectedToken.symbol === token.symbol ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                          }`}
                        >
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full text-white font-bold text-sm shadow-lg ${
                            token.symbol === 'MOVE' ? 'bg-gradient-to-br from-purple-500 to-violet-600 shadow-purple-500/20' :
                            token.symbol === 'USDC' ? 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-blue-500/20' :
                            'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/20'
                          }`}>
                            {token.symbol.charAt(0)}
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{token.symbol}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">{token.name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{balances[token.symbol] || "0"}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">Balance</div>
                          </div>
                          {selectedToken.symbol === token.symbol && (
                            <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between px-1">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Available Balance</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{balances[selectedToken.symbol] || "0"} {selectedToken.symbol}</span>
                </div>
              </div>

              {/* Recipient */}
              <div className="relative mb-6">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Recipient Address
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x..."
                    className="w-full pl-12 pr-5 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono text-sm"
                  />
                </div>
              </div>

              {/* Amount */}
              <div className="relative mb-8">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-5 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-lg font-semibold"
                  />
                  <button
                    onClick={() => setAmount(balances[selectedToken.symbol] || "0")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-400 flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {txHash && (
                <div className="mb-6 p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-sm text-green-700 dark:text-green-400">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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

              {step && (
                <div className="mb-6 p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 text-sm text-purple-700 dark:text-purple-400 flex items-center gap-3">
                  <svg className="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="font-medium">{step}</span>
                </div>
              )}

              <button
                onClick={handleTransfer}
                disabled={!recipient || !amount || parseFloat(amount) <= 0 || submitting}
                className={`relative w-full py-4 rounded-2xl font-bold text-lg transition-all duration-300 overflow-hidden ${
                  recipient && amount && parseFloat(amount) > 0 && !submitting
                    ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                }`}
              >
                {recipient && amount && parseFloat(amount) > 0 && !submitting && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                )}
                <span className="relative flex items-center justify-center gap-2">
                  {submitting ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send {selectedToken.symbol}
                    </>
                  )}
                </span>
              </button>
            </div>
            )}
          </div>
        </div>
      </main>

      <RightSidebar isOpen={rightSidebarOpen} onClose={() => setRightSidebarOpen(false)} />
    </div>
  );
}


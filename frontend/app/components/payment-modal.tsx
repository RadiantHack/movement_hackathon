"use client";

import { useState, useEffect } from "react";
import { X, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useX402Payment, type PaymentRequirements } from "@/app/hooks/useX402Payment";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (paymentToken: string) => void;
  amount?: string;
  currency?: string;
  paymentRequirements?: PaymentRequirements | null; // Payment instructions from 402 response
}

/**
 * Payment Modal Component for x402 Payment Protocol
 * Opens when a 402 Payment Required error is encountered.
 */
export function PaymentModal({
  isOpen,
  onClose,
  onPaymentComplete,
  amount = "0.01",
  currency = "USDC",
  paymentRequirements,
}: PaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { payForAccess, isConnected } = useX402Payment();

  // Calculate display amount from payment requirements
  const displayAmount = paymentRequirements
    ? (BigInt(paymentRequirements.maxAmountRequired) / BigInt(100000000)).toString() // Convert from smallest units (8 decimals)
    : amount;

  const displayCurrency = paymentRequirements?.asset?.includes("aptos_coin")
    ? "MOVE"
    : currency;

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handlePayment = async () => {
    if (!paymentRequirements) {
      setError("Payment requirements not provided");
      return;
    }

    if (!isConnected) {
      setError("Please connect your Movement wallet first");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Use x402plus hook to process payment
      const paymentHeader = await payForAccess(paymentRequirements);

      // Payment header is the x-402 payment proof
      onPaymentComplete(paymentHeader);
    } catch (error: any) {
      console.error("Payment error:", error);
      setError(
        error?.message || "Payment failed. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-yellow-500">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Payment Required
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                x402 Payment Protocol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            disabled={isProcessing}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Premium Content Access</span>
              <br />
              This agent requires payment to access premium features. Complete
              the payment to continue.
            </p>
          </div>

          {/* Payment Amount */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Amount
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                One-time payment
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {displayAmount} {displayCurrency}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3">
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Wallet Connection Status */}
          {!isConnected && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                ⚠️ Please connect your Movement wallet to proceed with payment.
              </p>
            </div>
          )}

          {/* Info Note */}
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              🔒 Secure payment via x402 protocol. Your payment will be processed on Movement Network.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isProcessing || !isConnected || !paymentRequirements}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay {displayAmount} {displayCurrency}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

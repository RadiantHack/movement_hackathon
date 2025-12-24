"use client";

import { useState } from "react";
import { X, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (paymentToken: string) => void;
  amount?: string;
  currency?: string;
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
}: PaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "card">(
    "wallet"
  );

  if (!isOpen) {
    return null;
  }

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      // Simulate payment processing
      // In a real implementation, this would integrate with x402 payment protocol
      // For now, we'll generate a mock payment token
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Generate a mock payment token (in real implementation, this would come from x402)
      const paymentToken = `x402_payment_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      onPaymentComplete(paymentToken);
    } catch (error) {
      console.error("Payment error:", error);
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
                {amount} {currency}
              </p>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Payment Method
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod("wallet")}
                disabled={isProcessing}
                className={`rounded-lg border-2 p-4 transition-all ${
                  paymentMethod === "wallet"
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Wallet
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Connect wallet
                </div>
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                disabled={isProcessing}
                className={`rounded-lg border-2 p-4 transition-all ${
                  paymentMethod === "card"
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Card
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Credit/Debit
                </div>
              </button>
            </div>
          </div>

          {/* Info Note */}
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              💡 This is a demo payment flow. In production, this would
              integrate with the x402 payment protocol to process real payments.
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
            disabled={isProcessing}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay {amount} {currency}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

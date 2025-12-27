"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useX402Payment } from "@/app/hooks/useX402Payment";

// Get server URL - use environment variable or detect from window
const getServerUrl = (): string => {
  if (typeof window !== "undefined") {
    // Client-side: use current origin
    return window.location.origin;
  }
  // Server-side: use environment variable or default to localhost
  return process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
};

export function PremiumContent() {
  const { payForAccess, isConnected } = useX402Payment();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!isConnected) {
      setError("Connect wallet first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const serverUrl = getServerUrl();

      // 1. Get payment requirements
      const res = await fetch(`${serverUrl}/api/premiumchat`, {
        redirect: "manual",
      });

      if (res.status !== 402) {
        // Already paid or no payment required
        if (typeof window !== "undefined") {
          if (window.location.pathname === "/premiumchat") {
            // Already on the page, just reload to trigger access check
            window.location.reload();
          } else {
            // Navigate to premiumchat
            router.push("/premiumchat");
          }
        }
        return;
      }

      const paymentData = await res.json().catch(() => ({}));
      const accepts = paymentData.accepts || paymentData;

      if (!accepts?.[0]) {
        throw new Error("No payment requirements found in response");
      }

      // 2. Sign payment (opens wallet) - this creates the x-payment header
      const xPayment = await payForAccess(accepts[0]);

      if (!xPayment) {
        throw new Error("Failed to generate payment header");
      }

      // 3. Submit payment with x-payment header (x402plus expects lowercase)
      const paidRes = await fetch(`${serverUrl}/api/premiumchat`, {
        method: "GET",
        headers: { 
          "x-payment": xPayment, // Only send one header to avoid comma-separated values
        },
        redirect: "manual",
      });

      // Check response status
      console.log("[PremiumContent] Payment response status:", paidRes.status, "ok:", paidRes.ok);
      if (paidRes.status === 302 || paidRes.ok || paidRes.type === "opaqueredirect") {
        // Payment verified successfully - store payment token for future requests
        if (typeof window !== "undefined") {
          localStorage.setItem("premiumchat_payment_token", xPayment);
          const txHash = localStorage.getItem("premiumchat_last_tx_hash");
          const txTime = localStorage.getItem("premiumchat_last_tx_time");
          console.log("[PremiumContent] ✅ Payment verified and token stored!");
          console.log("[PremiumContent] Payment token stored in localStorage");
          console.log("[PremiumContent] Transaction hash:", txHash || "Not found");
          console.log("[PremiumContent] Payment time:", txTime || "Not found");
          console.log("[PremiumContent] Access retained - token will be used for future requests");
          console.log("[PremiumContent] Current pathname:", window.location.pathname);
        }
        // If we're already on /premiumchat, just reload the page
        // Otherwise navigate to it
        if (typeof window !== "undefined") {
          if (window.location.pathname === "/premiumchat") {
            // Already on the page, just reload to trigger access check
            console.log("[PremiumContent] Reloading current page to refresh access check");
            // Small delay to ensure token is stored
            setTimeout(() => {
              window.location.reload();
            }, 100);
          } else {
            // Navigate to premiumchat
            console.log("[PremiumContent] Navigating to /premiumchat");
            router.push("/premiumchat");
          }
        }
      } else if (paidRes.status === 402) {
        // Still requires payment - payment verification failed
        // Clear invalid token
        if (typeof window !== "undefined") {
          localStorage.removeItem("premiumchat_payment_token");
        }
        const errorData = await paidRes.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || "Payment verification failed. The facilitator may not support Movement Network or the payment signature is invalid.";
        throw new Error(errorMsg);
      } else {
        // Other error
        const errorData = await paidRes.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Payment failed with status ${paidRes.status}`);
      }
    } catch (err: any) {
      setError(err.message || "Payment failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-zinc-900 dark:text-zinc-100">
          x402 Premium Content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pay 1 MOVE to unlock exclusive content via x402 protocol.
        </p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <Button
          onClick={handleUnlock}
          disabled={isLoading || !isConnected}
          className="w-full bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
        >
          {isLoading ? "Processing..." : "Unlock (1 MOVE)"}
        </Button>
      </CardContent>
    </Card>
  );
}


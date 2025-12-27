"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Sidebar } from "../components/sidebar";
import { RightSidebar } from "../components/right-sidebar";
import PremiumChat from "../components/chat/PremiumChat";
import { ThemeToggle } from "../components/themeToggle";
import { PremiumContent } from "../components/premium-content";

export default function PremiumChatPage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("premium_lending");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const isCheckingRef = useRef(false); // Prevent duplicate calls

  // Get Movement wallet address (chainType is "aptos" for Movement wallets)
  const movementWallet = useMemo(() => {
    // Only check for wallet when Privy is ready and user is authenticated
    if (!ready || !authenticated || !user?.linkedAccounts) {
      return null;
    }

    // Find Aptos wallet (Movement Network uses Aptos-compatible addresses)
    // The chainType field is camelCase: "aptos" (confirmed from Privy data structure)
    const aptosWallet = user.linkedAccounts.find(
      (account): account is WalletWithMetadata => {
        if (account.type !== "wallet") return false;
        // Type assertion needed because Privy types don't expose chainType directly
        const walletAccount = account as WalletWithMetadata & {
          chainType?: string;
        };
        return walletAccount.chainType === "aptos";
      }
    ) as (WalletWithMetadata & { chainType?: string }) | undefined;

    return aptosWallet || null;
  }, [user, ready, authenticated]);

  // Get the wallet address - ensure it's the full 66-character Movement/Aptos address
  const walletAddress = useMemo(() => {
    if (!movementWallet?.address) return null;

    const addr = movementWallet.address;
    // Ensure address is properly formatted (should be 66 chars for Movement/Aptos)
    if (addr && addr.startsWith("0x") && addr.length >= 42) {
      return addr;
    }
    return null;
  }, [movementWallet]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Check payment access on mount and when payment is completed
  // Memoize to prevent unnecessary re-renders and use ref to prevent duplicate calls
  const checkAccess = useCallback(async () => {
    // Prevent duplicate calls (React StrictMode double-invokes in dev)
    if (isCheckingRef.current) {
      return;
    }

    if (!ready || !authenticated) {
      return;
    }

    isCheckingRef.current = true;
    setIsCheckingAccess(true);
    
    let timeoutId: NodeJS.Timeout | null = null;
    const controller = new AbortController();
    
    // Get stored payment token if available (outside try block so it's accessible in catch)
    const storedPaymentToken = typeof window !== "undefined" 
      ? localStorage.getItem("premiumchat_payment_token")
      : null;
    
    try {
      // Use current origin for API calls
      const serverUrl = typeof window !== "undefined" 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
      
      // Add timeout to prevent hanging
      // If we have a payment token, server might need to verify with facilitator (up to 15s)
      // Give extra time (30s) to allow for facilitator verification
      // If no token, server needs to check blockchain (on-chain verification) which can take 10-15s
      // Increase timeout to 20s for on-chain checks to ensure we don't timeout before server responds
      const timeoutDuration = storedPaymentToken ? 30000 : 20000; // 30s with token, 20s without (for on-chain check)
      timeoutId = setTimeout(() => {
        console.log("[premiumchat page] Timeout fired, aborting request");
        controller.abort();
      }, timeoutDuration);

      console.log("[premiumchat page] Checking access, token present:", !!storedPaymentToken);
      console.log("[premiumchat page] Wallet address available:", !!walletAddress, walletAddress || "Not available");
      
      if (storedPaymentToken) {
        const txHash = typeof window !== "undefined" ? localStorage.getItem("premiumchat_last_tx_hash") : null;
        const txTime = typeof window !== "undefined" ? localStorage.getItem("premiumchat_last_tx_time") : null;
        const txConfirmed = typeof window !== "undefined" ? localStorage.getItem("premiumchat_last_tx_confirmed") : null;
        console.log("[premiumchat page] Using stored payment token for access check");
        console.log("[premiumchat page] Last transaction hash:", txHash || "Not found");
        console.log("[premiumchat page] Last payment time:", txTime || "Not found");
        console.log("[premiumchat page] Transaction confirmed:", txConfirmed === "true" ? "Yes" : txConfirmed === "false" ? "Pending" : "Unknown");
        if (txHash) {
          console.log("[premiumchat page] View transaction:", `https://explorer.movementnetwork.xyz/txn/${txHash}`);
        }
      }
      console.log("[premiumchat page] Making request to:", `${serverUrl}/api/premiumchat`);

      const res = await fetch(`${serverUrl}/api/premiumchat`, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "Cache-Control": "no-cache",
          ...(storedPaymentToken ? { "x-payment": storedPaymentToken } : {}),
          ...(walletAddress ? { "x-wallet-address": walletAddress } : {}),
        },
      });

      // Clear timeout immediately after getting response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      console.log("[premiumchat page] ✅ Access check response received");
      console.log("[premiumchat page] Response status:", res.status);
      console.log("[premiumchat page] Response type:", res.type);
      console.log("[premiumchat page] Response ok:", res.ok);
      console.log("[premiumchat page] Response URL:", res.url);
      
      // Status 0 can mean:
      // 1. Request was aborted (timeout)
      // 2. Network error
      // 3. Redirect with redirect: "manual" (browser returns status 0 for redirects)
      if (res.status === 0) {
        console.warn("[premiumchat page] Status 0 received");
        console.warn("[premiumchat page] Response type:", res.type);
        console.warn("[premiumchat page] Response URL:", res.url);
        
        // Check if it's an opaque redirect (redirect: "manual" causes this for 302 responses)
        // When server sends 302 redirect, browser returns status 0 with type "opaqueredirect"
        // This means the server verified payment (either via token or on-chain) and granted access
        if (res.type === "opaqueredirect") {
          console.log("[premiumchat page] ✅ Opaque redirect detected - server sent 302 (access granted)");
          console.log("[premiumchat page] Server verified payment (token or on-chain) and granted access");
          // Grant access immediately - server already verified payment
          setHasAccess(true);
          return; // Early return - don't continue to error path
        }
        
        // If it's not an opaque redirect, it might be a network error or timeout
        // Check if we have a URL (might indicate a redirect that wasn't fully opaque)
        if (res.url && res.url !== `${serverUrl}/api/premiumchat`) {
          console.log("[premiumchat page] Status 0 with different URL - treating as redirect");
          setHasAccess(true);
          return;
        }
        
        // Otherwise, treat as error (timeout or network error)
        console.error("[premiumchat page] Status 0 - request was aborted or network error");
        if (storedPaymentToken) {
          console.log("[premiumchat page] Token present but status 0 - might be timeout");
        }
        setHasAccess(false);
        return; // Early return
      }
      
      console.log("[premiumchat page] Response headers:", Object.fromEntries(res.headers.entries()));
      
      if (res.status === 402) {
        // Parse and log the 402 response body
        try {
          const responseData = await res.json();
          console.log("[premiumchat page] 402 Payment Required received:", JSON.stringify(responseData, null, 2));
        } catch (e) {
          console.log("[premiumchat page] 402 Payment Required received (could not parse response body)");
        }
        // Payment required - clear invalid token
        if (typeof window !== "undefined" && storedPaymentToken) {
          localStorage.removeItem("premiumchat_payment_token");
        }
        setHasAccess(false);
      } else if (res.status === 200 || res.status === 302 || res.status === 408) {
        // Access granted (200), redirect (302), or timeout but assume access (408)
        if (res.status === 302) {
          console.log("[premiumchat page] ✅ 302 Redirect received - payment verified, granting access");
          const location = res.headers.get("location");
          console.log("[premiumchat page] Redirect location:", location);
          // 302 means payment verified - grant access immediately
          setHasAccess(true);
          return; // Early return to grant access
        } else if (res.status === 200) {
          console.log("[premiumchat page] ✅ 200 OK received - access granted");
          setHasAccess(true);
          return; // Early return to grant access
        } else if (res.status === 408) {
          // Timeout - show payment UI but don't block
          console.log("[premiumchat page] 408 Timeout - showing payment UI");
          setHasAccess(false);
          return; // Early return to prevent setting hasAccess to true
        }
        // Grant access for 200 or 302 (fallback)
        setHasAccess(true);
      } else {
        // Other status - assume payment required
        console.log("[premiumchat page] Unexpected status code:", res.status, "- showing payment UI");
        setHasAccess(false);
      }
    } catch (error: any) {
      // Handle timeout gracefully
      if (error.name === "AbortError") {
        console.log("[premiumchat page] Request aborted (AbortError)");
        // If we have a token, the facilitator might be slow - don't clear token immediately
        // The token might still be valid, just the verification is taking too long
        if (storedPaymentToken) {
          console.log("[premiumchat page] Token present but request timed out - facilitator might be slow");
          console.log("[premiumchat page] Keeping token, but showing payment UI for now");
          // Don't clear token - it might still be valid, just verification is slow
        } else {
          console.log("[premiumchat page] No token and request timed out - showing payment UI");
        }
        setHasAccess(false);
      } else if (error.name === "TypeError" && error.message?.includes("Failed to fetch")) {
        // Network error
        console.error("[premiumchat page] Network error:", error.message);
        setHasAccess(false);
      } else {
        // Log other errors
        console.error("[premiumchat page] Error checking access:", error);
        console.error("[premiumchat page] Error name:", error.name);
        console.error("[premiumchat page] Error message:", error.message);
        setHasAccess(false);
      }
    } finally {
      // Always clear timeout to prevent memory leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setIsCheckingAccess(false);
      isCheckingRef.current = false;
    }
  }, [ready, authenticated]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Show loading while checking authentication status or payment access
  if (!ready || isCheckingAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-center">
          <div className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (handled by useEffect, but show nothing while redirecting)
  if (!authenticated) {
    return null;
  }

  // Show payment component if access denied
  if (hasAccess === false) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="mx-auto max-w-md px-4">
          <PremiumContent />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-black">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isPremiumMode={true}
        selectedAgent={selectedAgent}
        onAgentChange={setSelectedAgent}
      />

      <div className="flex flex-1 flex-col min-h-0 border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Mobile Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Premium Chat
          </span>
          <button
            onClick={() => setIsRightSidebarOpen(true)}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>
        </div>

        <div className="hidden shrink-0 border-b flex-row border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:block">
          <div className="flex flex-row items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Premium Chat
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Direct agent communication with x402 payment support
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden rounded-b-lg border-b border-zinc-200 dark:border-zinc-800">
          <PremiumChat
            walletAddress={walletAddress}
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
          />
        </div>
      </div>

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
      />
    </div>
  );
}

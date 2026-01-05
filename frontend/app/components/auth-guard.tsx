"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * AuthGuard component that ensures users are authenticated before accessing protected content.
 * Redirects to the landing page (or specified route) if not authenticated.
 */
export function AuthGuard({
  children,
  redirectTo = "/",
}: AuthGuardProps) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push(redirectTo);
    }
  }, [ready, authenticated, router, redirectTo]);

  // Show loading while checking authentication status
  if (!ready) {
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

  // If not authenticated, don't render children (redirect is happening)
  if (!authenticated) {
    return null;
  }

  // User is authenticated, render children
  return <>{children}</>;
}


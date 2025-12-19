"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./components/themeToggle";

export default function Home() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  const handleEmailLogin = () => {
    login();
  };

  // Redirect authenticated users to /chat
  useEffect(() => {
    if (ready && authenticated) {
      router.push("/chat");
    }
  }, [ready, authenticated, router]);

  // Show loading while checking authentication status
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-center">
          <div className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-50 dark:bg-black">
      {/* Theme Toggle Button */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Animated floating shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-zinc-200/50 dark:bg-zinc-800/30 blur-3xl animate-[pulse_4s_ease-in-out_infinite]" />
        <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-zinc-300/40 dark:bg-zinc-700/20 blur-3xl animate-[pulse_5s_ease-in-out_infinite_1s]" />
        <div className="absolute top-1/2 right-1/3 h-32 w-32 rounded-full bg-zinc-200/30 dark:bg-zinc-800/20 blur-2xl animate-[pulse_3s_ease-in-out_infinite_0.5s]" />
      </div>

      <main className="relative z-10 flex w-full max-w-md flex-col items-center gap-10 px-8 py-16">
        {/* Logo/Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-100 shadow-xl animate-[bounce_3s_ease-in-out_infinite]">
          <svg
            className="h-10 w-10 text-white dark:text-zinc-900"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Welcome to Movement
          </h1>
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-400 max-w-sm">
            Your gateway to decentralized finance. Swap, lend, and manage your
            assets with AI assistance.
          </p>

          {/* Animated feature pills */}
          <div className="flex flex-wrap justify-center gap-3 py-2">
            <span className="px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 animate-[pulse_2s_ease-in-out_infinite]">
              Instant Swaps
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 animate-[pulse_2s_ease-in-out_infinite_0.3s]">
              Lending
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 animate-[pulse_2s_ease-in-out_infinite_0.6s]">
              AI-Powered
            </span>
          </div>

          <button
            onClick={handleEmailLogin}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-zinc-900 dark:bg-zinc-100 px-8 font-medium text-white dark:text-zinc-900 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Continue with Email
          </button>
        </div>

        {/* Footer */}
        <p className="text-sm text-zinc-400 dark:text-zinc-600">
          Powered by Movement Network
        </p>
      </main>
    </div>
  );
}

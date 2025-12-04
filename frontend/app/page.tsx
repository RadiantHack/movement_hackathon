"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

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

  // Show loading while checking authentication or redirecting
  if (!ready || authenticated) {
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-md text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Welcome to Movement
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Please sign in with your email to continue.
          </p>
          <button
            onClick={handleEmailLogin}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-8 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[250px]"
          >
            Login with Email
          </button>
        </div>
      </main>
    </div>
  );
}

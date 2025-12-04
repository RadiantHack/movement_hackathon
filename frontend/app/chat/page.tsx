"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ChatPage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Show loading while checking authentication
  if (!ready || !authenticated) {
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

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex-1">
        <CopilotChat
          instructions="You are assisting the user as best as you can. Answer in the best way possible given the data you have."
          labels={{
            title: "Movement Assistant",
            initial: "Hi! 👋 How can I assist you today?",
          }}
        />
      </div>
    </div>
  );
}

"use client";

import { CopilotChat } from "@copilotkit/react-ui";

export default function ChatPage() {
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

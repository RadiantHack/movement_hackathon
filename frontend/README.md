# Movement Nexus - Frontend

**AI-Powered Gateway to Movement Network DeFi**

Next.js frontend for Movement Nexus, featuring CopilotKit-powered AI chat interface for interacting with 8 specialized DeFi agents.

## Features

- 🤖 **AI Chat Interface**: CopilotKit-powered conversational UI
- 🎯 **Multi-Agent Access**: Interact with 8 specialized agents through natural language
- 🔐 **Privy Authentication**: Secure wallet connection and user management
- 🌐 **Movement Network Integration**: Native support for Movement blockchain
- ⚡ **Real-time Updates**: Live agent responses and status updates
- 🎨 **Modern UI**: Tailwind CSS with dark mode support

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file:

   ```bash
   NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
   NEXT_PUBLIC_PRIVY_CLIENT_ID=your-privy-client-id
   ```

3. **Run the development server:**

   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)**

## Available Agents

Access these agents through the chat interface:

- **Balance Agent** - Check cryptocurrency balances
- **Bridge Agent** - Cross-chain asset bridging
- **Lending Agent** - Lending & borrowing

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI Chat**: CopilotKit
- **Authentication**: Privy
- **Blockchain**: Movement Network (EVM-compatible)

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [CopilotKit Documentation](https://docs.copilotkit.ai)
- [Privy Documentation](https://docs.privy.io)
- [Movement Network](https://movementlabs.xyz)

# movement_hackathon

## Setup

### Frontend Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Set up Privy authentication:
   - Create a `.env.local` file in the `frontend` directory
   - Get your Privy App ID from [Privy Dashboard](https://dashboard.privy.io)
   - Add the following to `.env.local`:
     ```
     NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
     ```
   - Optionally add `NEXT_PUBLIC_PRIVY_CLIENT_ID` for multi-environment setup

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Privy Authentication

This project uses [Privy](https://privy.io) for authentication and wallet management. The setup includes:

- **PrivyProvider**: Wraps the app in `app/providers.tsx`
- **Embedded Wallets**: Automatically created for users without wallets
- **Ready State**: Use `usePrivy` hook to check when Privy is ready

Example usage:
```typescript
import { usePrivy } from '@privy-io/react-auth';

const { ready, authenticated, user, login, logout } = usePrivy();
```

See `app/components/privy-example.tsx` for a complete example.

For more information, visit the [Privy React Documentation](https://docs.privy.io/basics/react/setup).

## Features

- ✅ Next.js 16 with App Router
- ✅ TypeScript
- ✅ Tailwind CSS
- ✅ PWA Support
- ✅ Privy Authentication
- ✅ Prettier Code Formatting

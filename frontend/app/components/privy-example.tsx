"use client";

import { usePrivy } from "@privy-io/react-auth";

export function PrivyExample() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return <div>Loading Privy...</div>;
  }

  if (!authenticated) {
    return (
      <div>
        <p>Not authenticated</p>
        <button onClick={login}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <p>Authenticated as: {user?.id}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

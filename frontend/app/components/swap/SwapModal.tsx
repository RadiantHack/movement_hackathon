"use client";

import { SwapCard } from "../features/swap/SwapCard";
import ModalShell from "../modal/ModalShell";

interface SwapModalProps {
  walletAddress?: string | null;
  onClose: () => void;
}

export default function SwapModal({ walletAddress, onClose }: SwapModalProps) {
  if (!walletAddress) return null;

  return (
    <ModalShell onClose={onClose} containerClass="max-w-lg">
      <SwapCard walletAddress={walletAddress} />
    </ModalShell>
  );
}

"use client";

import { SwapCard } from "./SwapCard";
import { ModalShell } from "../shared/modals";

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

"use client";

import BridgeForm from "./BridgeForm";
import { ModalShell } from "../shared/modals";

interface BridgeModalProps {
  walletAddress?: string | null;
  onClose: () => void;
}

export default function BridgeModal({
  walletAddress,
  onClose,
}: BridgeModalProps) {
  if (!walletAddress) return null;

  return (
    <ModalShell onClose={onClose} containerClass="max-w-md">
      <BridgeForm walletAddress={walletAddress} />
    </ModalShell>
  );
}

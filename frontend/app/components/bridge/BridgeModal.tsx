"use client";

import BridgeForm from "./BridgeForm";
import ModalShell from "../modal/ModalShell";

interface BridgeModalProps {
  walletAddress?: string | null;
  onClose: () => void;
}

export default function BridgeModal({ walletAddress, onClose }: BridgeModalProps) {
  if (!walletAddress) return null;

  return (
    <ModalShell onClose={onClose} containerClass="max-w-4xl h-[80vh]">
      <div className="w-full h-full overflow-auto">
        <BridgeForm walletAddress={walletAddress} />
      </div>
    </ModalShell>
  );
}

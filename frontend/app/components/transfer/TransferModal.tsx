"use client";

import { TransferForm } from "./transfer-form";
import { ModalShell } from "../shared/modals";

interface TransferModalProps {
  walletAddress?: string | null;
  balances?: any[];
  initialToken?: any;
  onClose: () => void;
  onTransferComplete?: () => void;
}

export default function TransferModal({
  walletAddress,
  balances,
  initialToken,
  onClose,
  onTransferComplete,
}: TransferModalProps) {
  if (!walletAddress) return null;

  return (
    <ModalShell onClose={onClose} containerClass="max-w-md">
      <TransferForm
        walletAddress={walletAddress}
        balances={balances || []}
        initialToken={initialToken}
        onTransferComplete={onTransferComplete}
      />
    </ModalShell>
  );
}

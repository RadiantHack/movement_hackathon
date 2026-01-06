"use client";

import React from "react";

interface ModalShellProps {
  onClose: () => void;
  containerClass?: string; // additional classes for inner container (width/height)
  children: React.ReactNode;
}

export default function ModalShell({ onClose, containerClass = "max-w-lg", children, }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`relative w-full ${containerClass} rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Close modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

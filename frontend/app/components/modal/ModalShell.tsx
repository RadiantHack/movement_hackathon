"use client";

import React from "react";

interface ModalShellProps {
  onClose: () => void;
  containerClass?: string; // additional classes for inner container (width/height)
  children: React.ReactNode;
}

export default function ModalShell({
  onClose,
  containerClass = "max-w-lg",
  children,
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${containerClass} rounded-3xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-zinc-900/20 dark:shadow-zinc-950/50 animate-scale-in max-h-[90vh] overflow-y-auto overflow-x-hidden`}
      >
        {/* Background decoration */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-tr from-violet-500/10 via-purple-500/5 to-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] opacity-40 pointer-events-none" />

        <button
          onClick={onClose}
          className="group absolute top-4 right-4 sm:top-5 sm:right-5 z-20 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all duration-200 p-2 sm:p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-zinc-200/60 dark:border-zinc-700/60 hover:border-zinc-300/80 dark:hover:border-zinc-600/80 hover:bg-white dark:hover:bg-zinc-800 hover:shadow-lg hover:shadow-zinc-900/10 dark:hover:shadow-zinc-950/30 active:scale-95"
          aria-label="Close modal"
        >
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-200 group-hover:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="relative z-10 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Echelon page header component
 * Extracted from echelon/page.tsx for better component organization
 */

import { ThemeToggle } from "../shared/ui";

interface EchelonHeaderProps {
  onSidebarToggle: () => void;
  onRightSidebarToggle: () => void;
}

export function EchelonHeader({
  onSidebarToggle,
  onRightSidebarToggle,
}: EchelonHeaderProps) {
  return (
    <>
      {/* Mobile Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:hidden">
        <button
          onClick={onSidebarToggle}
          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Echelon
        </h1>
        <button
          onClick={onRightSidebarToggle}
          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </button>
      </div>

      {/* Desktop Header */}
      <div className="hidden border-b border-zinc-200 dark:border-zinc-800 md:block">
        <div className="flex items-center justify-between px-8 py-4">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Echelon
          </h1>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}

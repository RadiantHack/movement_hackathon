"use client";

import { useState } from "react";
import { getAssetIconUrl } from "../utils/shared/icons";

interface AssetIconProps {
  symbol: string;
  echelonIcon?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | string;
  className?: string;
  showBadge?: boolean;
  badgeColor?: string;
  ring?: boolean;
}

const sizeMap: Record<string, string> = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

const textSizeMap: Record<string, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
  xl: "text-xl",
};

/**
 * Centralized AssetIcon component
 * Handles both Echelon icons and regular token icons with fallback to gradient
 */
export function AssetIcon({
  symbol,
  echelonIcon,
  size = "md",
  className = "",
  showBadge = false,
  badgeColor = "bg-purple-500",
  ring = false,
}: AssetIconProps) {
  const [imageError, setImageError] = useState(false);
  const iconUrl = getAssetIconUrl(symbol, echelonIcon);
  const sizeClass = sizeMap[size] || size;
  const textSize = textSizeMap[size] || "text-sm";
  const ringClass = ring
    ? "ring-2 ring-white dark:ring-zinc-800 shadow-lg"
    : "";

  // If we have an icon URL and no error, try to show the image
  if (iconUrl && !imageError) {
    return (
      <div className={`relative ${sizeClass} ${className}`}>
        <img
          src={iconUrl}
          alt={symbol}
          className={`${sizeClass} rounded-full object-cover ${ringClass}`}
          onError={() => setImageError(true)}
        />
        {showBadge && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${badgeColor} border-2 border-white dark:border-zinc-900`}
          />
        )}
      </div>
    );
  }

  // Fallback to gradient with first letter
  return (
    <div className={`relative ${sizeClass} ${className}`}>
      <div
        className={`${sizeClass} rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 flex items-center justify-center ${ringClass}`}
      >
        <span className={`text-white font-bold ${textSize}`}>
          {symbol.charAt(0).toUpperCase()}
        </span>
      </div>
      {showBadge && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${badgeColor} border-2 border-white dark:border-zinc-900`}
        />
      )}
    </div>
  );
}

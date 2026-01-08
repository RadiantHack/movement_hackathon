"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl" | number;
  variant?: "full" | "icon";
  className?: string;
}

const sizeMap: Record<string, number> = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
};

/**
 * Movement Nexus Logo Component
 * Displays the brand logo with 9 agent nodes and central nexus
 */
export function Logo({
  size = "md",
  variant = "full",
  className = "",
}: LogoProps) {
  const logoSize =
    typeof size === "number" ? size : sizeMap[size] || sizeMap.md;
  // Use SVG icons - use 192x192 for smaller sizes, 512x512 for larger
  const logoSrc = logoSize <= 64 
    ? "/icons/icon-192x192.svg" 
    : "/icons/icon-512x512.svg";

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ width: logoSize, height: logoSize }}
    >
      <img
        src={logoSrc}
        alt="Movement Nexus Logo"
        width={logoSize}
        height={logoSize}
        className="w-full h-full object-contain rounded-xl"
      />
    </div>
  );
}

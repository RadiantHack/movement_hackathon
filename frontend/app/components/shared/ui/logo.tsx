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
  const logoSrc = variant === "icon" ? "/logo-icon.svg" : "/logo.svg";

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
        className="w-full h-full object-contain"
      />
    </div>
  );
}

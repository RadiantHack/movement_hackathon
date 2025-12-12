"use client";
import React, { useEffect } from "react";
import { useTheme } from "next-themes";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <button
      className="outline-none"
      onClick={() => {
        setTheme(theme === "dark" ? "light" : "dark");
      }}
    >
      {/* <SunMoon size={32} /> */}
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

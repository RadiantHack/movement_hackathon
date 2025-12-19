"use client";
import React from "react";
import { useTheme } from "next-themes";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // const [mounted, setMounted] = React.useState(false);
  // useEffect(() => {
  //   setMounted(true);
  // }, []);

  // if (!mounted) {
  //   return null;
  // }

  return (
    <Button
      // className="outline-none text-black dark:text-white"
      variant={"ghost"}
      onClick={() => {
        setTheme(theme === "dark" ? "light" : "dark");
      }}
    >
      {/* <SunMoon size={32} /> */}
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

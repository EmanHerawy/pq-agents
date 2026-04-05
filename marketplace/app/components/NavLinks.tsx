"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function ThemeToggle() {
  // null = not yet mounted (SSR safe)
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
  }, []);

  function toggle() {
    // Always read current state from DOM to avoid stale closure
    const currentlyDark = document.documentElement.getAttribute("data-theme") !== "light";
    if (currentlyDark) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  }

  // suppressHydrationWarning because icon/color differs between SSR (null) and client
  return (
    <button
      onClick={toggle}
      suppressHydrationWarning
      title={isDark === false ? "Switch to dark mode" : "Switch to light mode"}
      className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-1)",
        color: isDark === false ? "#7a6130" : "#c9a84c",
        fontSize: "15px",
      }}
    >
      {isDark === false ? "☾" : "☀"}
    </button>
  );
}

export function NavLinks() {
  const pathname = usePathname();

  const linkStyle = (href: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return {
      color: active ? "#c9a84c" : "var(--text-3)",
      background: active ? "#c9a84c10" : "transparent",
      border: active ? "1px solid #c9a84c30" : "1px solid transparent",
      borderRadius: "6px",
      padding: "4px 12px",
      transition: "all 0.15s",
    };
  };

  return (
    <nav className="hidden md:flex items-center gap-4 text-base">
      <Link href="/marketplace" style={linkStyle("/marketplace")}>
        Marketplace
      </Link>
      <Link href="/fame" style={linkStyle("/fame")}>
        Wall of Fame
      </Link>
      <Link
        href="/my-agent"
        className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
        style={
          pathname === "/my-agent"
            ? {
                background: "linear-gradient(135deg, #c9a84c40, #c9a84c20)",
                border: "1px solid #c9a84c",
                color: "#c9a84c",
              }
            : {
                background: "linear-gradient(135deg, #c9a84c20, #c9a84c10)",
                border: "1px solid #c9a84c60",
                color: "#c9a84c",
              }
        }
      >
        My Agent ✦
      </Link>
      <ThemeToggle />
    </nav>
  );
}

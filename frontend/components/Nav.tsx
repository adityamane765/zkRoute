"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

const LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/buyer", label: "Portfolio" },
  { href: "/provider", label: "Providers" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[rgba(8,10,15,0.85)] backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-base tracking-tight flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-[rgba(0,255,135,0.15)] border border-[rgba(0,255,135,0.3)] flex items-center justify-center">
              <span className="text-[10px] text-[#00ff87] font-black">zk</span>
            </span>
            <span className="text-white">Route</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  path === l.href
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                {path === l.href && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-md bg-white/[0.06]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                  />
                )}
                <span className="relative">{l.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}

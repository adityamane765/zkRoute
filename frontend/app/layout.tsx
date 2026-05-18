import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Nav } from "../components/Nav";
import { MouseGlow } from "../components/ui/MouseGlow";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "zkRoute — Verified Alpha Marketplace",
  description: "Agent-to-agent signal marketplace. ZK-proven track records. Encrypted execution. Powered by Arc.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} grid-bg`}>
        <Providers>
          <MouseGlow />
          <div className="flex flex-col min-h-screen">
            <Nav />
            <main className="flex-1 flex flex-col">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

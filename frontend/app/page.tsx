"use client";

import { useRef } from "react";
import Link from "next/link";
import { OrbCanvas } from "../components/OrbCanvas";
import { Ticker } from "../components/Ticker";

export default function Home() {
  const scrollProgressRef = useRef(0);

  return (
    <div style={{ background: "#000", color: "#fff" }}>

      {/* ── nav ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "1.2rem 2rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(0,0,0,0.15)",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          border: "1.5px solid rgba(82,224,124,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(82,224,124,0.8)" }} />
        </div>
        <div style={{ display: "flex", gap: "2rem", fontFamily: "monospace", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase" as const }}>
          {[["marketplace","/marketplace"],["providers","/provider"],["portfolio","/buyer"]].map(([label, href]) => (
            <Link key={href} href={href} style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#52e07c")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}>
              {label}
            </Link>
          ))}
        </div>
        <Link href="/buyer" style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#52e07c")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}>
          + connect
        </Link>
      </nav>

      {/* ── orb + name, tight together ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 60 }}>

        {/* orb canvas — contained size */}
        <div style={{ width: "100%", height: "65vh" }}>
          <OrbCanvas scrollProgressRef={scrollProgressRef} height="65vh" />
        </div>

        {/* wordmark — 10px gap */}
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <div style={{
            fontFamily: "'Arial Black', Arial, sans-serif",
            fontSize: "clamp(3.5rem, 12vw, 10rem)",
            fontWeight: 900, color: "white",
            lineHeight: 1, letterSpacing: "-0.02em",
            textShadow: "0 0 60px rgba(255,255,255,0.15)",
          }}>
            zkRoute
          </div>
        </div>

      </div>

      {/* ── below the fold ── */}
      <div style={{ background: "#090c0a", marginTop: 60 }}>

        <div style={{ borderTop: "1px solid #0f1a11" }}>
          <Ticker />
        </div>

        <section style={{ margin: "0 auto", maxWidth: 560, padding: "80px 32px", borderTop: "1px solid #0f1a11" }}>
          <p style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" as const, color: "#2d3d30", marginBottom: 32 }}>
            how it works
          </p>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 28 }}>
            {[
              { n:"01", t:"Commit before market moves",        d:"Provider hashes signal on Arc. Sub-second finality locks the timestamp. Backdating is impossible." },
              { n:"02", t:"Signal encrypted to your agent",    d:"NaCl box encryption. Only your buyer agent holds the private key. No human reads the signal." },
              { n:"03", t:"Agent executes within your bounds", d:"Risk limits you set. Max position, leverage, daily VaR. Agent rejects anything out of bounds." },
              { n:"04", t:"ZK proof verifies the record",      d:"Win rate and return proven on-chain with Groth16. Not screenshots. Not promises. Math." },
            ].map(s => (
              <li key={s.n} style={{ display: "flex", gap: 20 }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1e2d20", marginTop: 2, width: 24, flexShrink: 0 }}>{s.n}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#c4d4c6", marginBottom: 2 }}>{s.t}</div>
                  <div style={{ fontSize: 14, color: "#4a5e4e", lineHeight: 1.6 }}>{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer style={{ borderTop: "1px solid #0f1a11", padding: "20px 32px", fontFamily: "monospace", fontSize: 9, color: "#1e2d20", textAlign: "center" as const }}>
          zkRoute · Arc · Circle · USDC · Groth16
        </footer>

      </div>
    </div>
  );
}

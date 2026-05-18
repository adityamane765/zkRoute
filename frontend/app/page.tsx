"use client";

import { useRef } from "react";
import Link from "next/link";
import { OrbCanvas } from "../components/OrbCanvas";
import { Ticker } from "../components/Ticker";

export default function Home() {
  const scrollProgressRef = useRef(0);

  return (
    <div style={{ background: "#000", color: "#fff" }}>

      {/* ── sticky canvas hero (100vh, scrolls away naturally) ── */}
      <div style={{ position: "relative", height: "200vh" }}>

        <OrbCanvas scrollProgressRef={scrollProgressRef} />

        {/* nav — fixed over canvas */}
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          padding: "1.5rem 2rem",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "rgba(0,0,0,0.15)",
        }}>
          {/* logo mark */}
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1.5px solid rgba(82,224,124,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(82,224,124,0.8)" }} />
          </div>

          {/* links */}
          <div style={{ display: "flex", gap: "2rem", fontFamily: "monospace", fontSize: 11,
            letterSpacing: "1px", textTransform: "uppercase" }}>
            <Link href="/marketplace" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#52e07c")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>
              marketplace
            </Link>
            <Link href="/provider" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#52e07c")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>
              providers
            </Link>
            <Link href="/buyer" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#52e07c")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>
              portfolio
            </Link>
          </div>

          {/* connect hint */}
          <Link href="/buyer" style={{
            fontFamily: "monospace", fontSize: 11, letterSpacing: "1px",
            textTransform: "uppercase", color: "rgba(255,255,255,0.7)", textDecoration: "none",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "#52e07c")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>
            + connect
          </Link>
        </nav>

        {/* big wordmark — fixed bottom 15%, fades on scroll */}
        <div style={{
          position: "fixed", bottom: "15%", left: 0, right: 0, zIndex: 50,
          pointerEvents: "none", textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Arial Black', Arial, sans-serif",
            fontSize: "clamp(4rem, 14vw, 11rem)",
            fontWeight: 900, color: "white",
            lineHeight: 0.85, letterSpacing: "-0.02em",
            textShadow: "0 0 60px rgba(255,255,255,0.2)",
          }}>
            zkRoute
          </div>
        </div>

        {/* left side text */}
        <div style={{
          position: "fixed", left: "2rem", top: "40%", zIndex: 50,
          pointerEvents: "none",
        }}>
          <div style={{
            fontFamily: "monospace", fontSize: 10, color: "white",
            lineHeight: 1.7, letterSpacing: "0.5px", textTransform: "uppercase",
            opacity: 0.6, maxWidth: 140,
          }}>
            signals stay<br />
            private forever<br />
            math proves<br />
            the rest
          </div>
        </div>

        {/* right side text */}
        <div style={{
          position: "fixed", right: "2rem", top: "40%", zIndex: 50,
          pointerEvents: "none", textAlign: "right",
        }}>
          <div style={{
            fontFamily: "monospace", fontSize: 10, color: "white",
            lineHeight: 1.7, letterSpacing: "0.5px", textTransform: "uppercase",
            opacity: 0.6, maxWidth: 140,
          }}>
            commit · encrypt<br />
            reveal · prove<br />
            arc · usdc<br />
            groth16
          </div>
        </div>

        {/* bottom-left attribution */}
        <div style={{
          position: "fixed", bottom: "8%", left: "2rem", zIndex: 50,
          pointerEvents: "none",
        }}>
          <div style={{
            fontFamily: "monospace", fontSize: 9, color: "white",
            letterSpacing: "1px", textTransform: "uppercase", opacity: 0.4,
          }}>
            arc · circle · zk · $0.01/signal
          </div>
        </div>

      </div>

      {/* ── below the fold ── */}
      <div style={{ background: "#090c0a" }}>

        {/* ticker */}
        <div style={{ borderTop: "1px solid #0f1a11" }}>
          <Ticker />
        </div>

        {/* how it works */}
        <section style={{
          margin: "0 auto", maxWidth: 560, padding: "80px 32px",
          borderTop: "1px solid #0f1a11",
        }}>
          <p style={{
            fontFamily: "monospace", fontSize: 10, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "#2d3d30", marginBottom: 32,
          }}>how it works</p>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 28 }}>
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

        {/* footer */}
        <footer style={{
          borderTop: "1px solid #0f1a11", padding: "20px 32px",
          fontFamily: "monospace", fontSize: 9, color: "#1e2d20", textAlign: "center",
        }}>
          zkRoute · Arc · Circle · USDC · Groth16
        </footer>

      </div>
    </div>
  );
}

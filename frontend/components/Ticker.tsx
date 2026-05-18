const EVENTS = [
  "ETH Momentum Alpha  ·  LONG ETH  ·  agent executed  ·  +2.3%",
  "BTC Swing Desk  ·  ZK proof submitted  ·  68% win rate verified",
  "Multi-Asset Intraday  ·  SHORT ETH  ·  agent executed  ·  +1.1%",
  "ETH Momentum Alpha  ·  LONG BTC  ·  agent executed  ·  +4.7%",
  "Macro Quant  ·  LONG ETH  ·  agent executed  ·  +3.2%",
  "BTC Swing Desk  ·  SHORT BTC  ·  agent executed  ·  −0.8%",
];

export function Ticker() {
  const text = EVENTS.join("     ·····     ");
  const doubled = text + "     ·····     " + text;

  return (
    <div className="relative w-full overflow-hidden">
      {/* fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10"
        style={{ background: "linear-gradient(to right, #090c0a, transparent)" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10"
        style={{ background: "linear-gradient(to left, #090c0a, transparent)" }} />

      <div className="ticker-track whitespace-nowrap font-mono text-[10px] text-[#2a3d2c] tracking-wider py-1">
        {doubled}
      </div>
    </div>
  );
}

"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface Position { open_time: string; pnl_bps: number | null; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  const up = val >= 0;
  return (
    <div className="rounded-lg border border-[#0f1a11] bg-[#0c110d] px-3 py-2 font-mono text-xs shadow-xl">
      <div className="mb-1 text-[#2d3d30]">{label}</div>
      <div className={up ? "text-[#52e07c]" : "text-red-400"}>
        {up ? "+" : ""}{val.toFixed(2)}%
      </div>
    </div>
  );
};

export function EquityCurve({ positions }: { positions: Position[] }) {
  const sorted = [...positions].sort((a, b) =>
    new Date(a.open_time).getTime() - new Date(b.open_time).getTime()
  );

  let cum = 0;
  const data = sorted.map(p => {
    cum += (p.pnl_bps ?? 0) / 100;
    return {
      date: new Date(p.open_time).toLocaleDateString("en-US", { month:"short", day:"numeric" }),
      v: parseFloat(cum.toFixed(2)),
    };
  });

  if (!data.length) {
    return <div className="flex h-40 items-center justify-center font-mono text-xs text-[#1e2d20]">no data</div>;
  }

  const up = cum >= 0;
  const color = up ? "#52e07c" : "#f87171";

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize:10, fill:"#1e2d20", fontFamily:"monospace" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize:10, fill:"#1e2d20", fontFamily:"monospace" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#0f1a11" />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill="url(#eq)" dot={false} activeDot={{ r:3, fill:color, strokeWidth:0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

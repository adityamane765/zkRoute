"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";

interface Position {
  open_time: string;
  pnl_bps: number | null;
}

interface Props {
  positions: Position[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  const isUp = val >= 0;
  return (
    <div className="bg-[#0d1117] border border-white/[0.08] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-500 mb-1">{label}</div>
      <div className={`stat-num font-bold ${isUp ? "text-[#00ff87]" : "text-red-400"}`}>
        {isUp ? "+" : ""}{val.toFixed(2)}%
      </div>
    </div>
  );
};

export function EquityCurve({ positions: rawPositions }: Props) {
  const sorted = [...rawPositions].sort(
    (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime()
  );

  let cumulative = 0;
  const data = sorted.map((p) => {
    cumulative += (p.pnl_bps ?? 0) / 100;
    return {
      date: new Date(p.open_time).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      equity: parseFloat(cumulative.toFixed(2)),
    };
  });

  if (data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-gray-700 text-xs">
        No trade data yet
      </div>
    );
  }

  const isPositive = cumulative >= 0;
  const color = isPositive ? "#00ff87" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="4 4"
          stroke="rgba(255,255,255,0.03)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#4b5563" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#4b5563" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="equity"
          stroke={color}
          strokeWidth={1.5}
          fill="url(#equityGradient)"
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

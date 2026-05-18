import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  variant?: "green" | "blue" | "amber" | "red" | "gray";
  className?: string;
}

const variants = {
  green: "bg-[rgba(0,255,135,0.1)] text-[#00ff87] border border-[rgba(0,255,135,0.25)]",
  blue:  "bg-[rgba(0,194,255,0.1)] text-[#00c2ff] border border-[rgba(0,194,255,0.25)]",
  amber: "bg-[rgba(251,191,36,0.1)] text-amber-400 border border-amber-400/25",
  red:   "bg-[rgba(239,68,68,0.1)] text-red-400 border border-red-400/25",
  gray:  "bg-white/5 text-gray-400 border border-white/10",
};

export function Badge({ children, variant = "gray", className }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase font-mono", variants[variant], className)}>
      {children}
    </span>
  );
}

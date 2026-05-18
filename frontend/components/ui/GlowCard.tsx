"use client";

import { useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
  glowOnHover?: boolean;
}

export function GlowCard({ children, className, glowOnHover = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("relative overflow-hidden rounded-xl glass transition-all duration-300", className)}
      style={
        glowOnHover && hovered
          ? { borderColor: "rgba(0,255,135,0.2)", boxShadow: "0 0 0 1px rgba(0,255,135,0.08)" }
          : {}
      }
    >
      {glowOnHover && hovered && (
        <div
          className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
          style={{
            opacity: 1,
            background: `radial-gradient(180px circle at ${pos.x}px ${pos.y}px, rgba(0,255,135,0.06), transparent 80%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

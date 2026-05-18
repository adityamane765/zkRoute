import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        green: {
          DEFAULT: "#00ff87",
          dim: "#00c96a",
          glow: "rgba(0,255,135,0.15)",
        },
        surface: "rgba(255,255,255,0.03)",
        border: "rgba(255,255,255,0.07)",
        ink: {
          DEFAULT: "#e8eaf0",
          muted: "#6b7280",
          subtle: "#374151",
        },
        bg: {
          DEFAULT: "#080a0f",
          card: "#0d1117",
          elevated: "#111827",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      backgroundImage: {
        "glow-green": "radial-gradient(ellipse at center, rgba(0,255,135,0.15) 0%, transparent 70%)",
        "glow-blue": "radial-gradient(ellipse at center, rgba(0,194,255,0.1) 0%, transparent 70%)",
      },
      boxShadow: {
        "green-sm": "0 0 12px rgba(0,255,135,0.15)",
        "green-md": "0 0 30px rgba(0,255,135,0.25)",
        "green-lg": "0 0 60px rgba(0,255,135,0.2)",
        "card": "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;

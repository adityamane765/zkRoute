"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function OrbCanvas({ scrollProgressRef, height = "100vh" }: { scrollProgressRef: React.MutableRefObject<number>; height?: string | number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const grainCanvas = grainCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const grainCtx = grainCanvas.getContext("2d")!;

    const density = " .:-=+*#%@";

    const params = { rotation: 0, atmosphereShift: 0, glitchIntensity: 0, glitchFrequency: 0 };

    gsap.to(params, { rotation: Math.PI * 2, duration: 20, repeat: -1, ease: "none" });
    gsap.to(params, { atmosphereShift: 1, duration: 6, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(params, {
      glitchIntensity: 1, duration: 0.1, repeat: -1, yoyo: true,
      ease: "power2.inOut", repeatDelay: Math.random() * 3 + 1,
    });
    gsap.to(params, { glitchFrequency: 1, duration: 0.05, repeat: -1, yoyo: true, ease: "none" });

    ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top top",
      end: "bottom top",
      scrub: 1,
      onUpdate: (self) => { scrollProgressRef.current = self.progress; },
    });

    const generateFilmGrain = (w: number, h: number, intensity = 0.15) => {
      const imageData = grainCtx.createImageData(w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const grain = (Math.random() - 0.5) * intensity * 255;
        data[i] = Math.max(0, Math.min(255, 128 + grain));
        data[i + 1] = Math.max(0, Math.min(255, 128 + grain));
        data[i + 2] = Math.max(0, Math.min(255, 128 + grain));
        data[i + 3] = Math.abs(grain) * 3;
      }
      return imageData;
    };

    const drawGlitchedOrb = (cx: number, cy: number, radius: number, hue: number, glitchIntensity: number) => {
      ctx.save();
      const shouldGlitch = Math.random() < 0.1 && glitchIntensity > 0.5;
      const glitchOffset = shouldGlitch ? (Math.random() - 0.5) * 20 * glitchIntensity : 0;
      const glitchScale = shouldGlitch ? 1 + (Math.random() - 0.5) * 0.3 * glitchIntensity : 1;

      if (shouldGlitch) {
        ctx.translate(glitchOffset, glitchOffset * 0.8);
        ctx.scale(glitchScale, 1 / glitchScale);
      }

      const orbGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
      orbGradient.addColorStop(0, `hsla(${hue + 10}, 100%, 95%, 0.9)`);
      orbGradient.addColorStop(0.2, `hsla(${hue + 20}, 90%, 80%, 0.7)`);
      orbGradient.addColorStop(0.5, `hsla(${hue}, 70%, 50%, 0.4)`);
      orbGradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = orbGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerRadius = radius * 0.3;
      ctx.fillStyle = `hsla(${hue + 20}, 100%, 95%, 0.8)`;
      ctx.beginPath();
      ctx.arc(cx, cy, centerRadius, 0, Math.PI * 2);
      ctx.fill();

      if (shouldGlitch) {
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = `hsla(100, 100%, 50%, ${0.6 * glitchIntensity})`;
        ctx.beginPath(); ctx.arc(cx + glitchOffset * 0.5, cy, centerRadius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(240, 100%, 50%, ${0.5 * glitchIntensity})`;
        ctx.beginPath(); ctx.arc(cx - glitchOffset * 0.5, cy, centerRadius, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";

        ctx.strokeStyle = `rgba(255,255,255,${0.6 * glitchIntensity})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = cy - radius + Math.random() * radius * 2;
          ctx.beginPath(); ctx.moveTo(cx - radius + Math.random() * 20, y);
          ctx.lineTo(cx + radius - Math.random() * 20, y); ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,0,255,${0.4 * glitchIntensity})`;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(cx - radius + Math.random() * radius * 2, cy - radius + Math.random() * radius * 2,
            Math.random() * 10 + 2, Math.random() * 10 + 2);
        }
      }

      ctx.strokeStyle = `hsla(${hue + 20}, 80%, 70%, 0.6)`;
      ctx.lineWidth = 2;
      if (shouldGlitch) {
        for (let i = 0; i < 8; i++) {
          const ringRadius = radius * 1.2 + (Math.random() - 0.5) * 10 * glitchIntensity;
          ctx.beginPath();
          ctx.arc(cx, cy, ringRadius, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2); ctx.stroke();
      }

      if (shouldGlitch && Math.random() < 0.3) {
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = `rgba(255,255,255,${0.8 * glitchIntensity})`;
        for (let i = 0; i < 3; i++) {
          const barY = cy - radius + Math.random() * radius * 2;
          ctx.fillRect(cx - radius, barY, radius * 2, Math.random() * 5 + 1);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
    };

    function render() {
      timeRef.current += 0.016;
      const time = timeRef.current;
      const container = containerRef.current!;
      const width = canvas.width = grainCanvas.width = container.offsetWidth;
      const height = canvas.height = grainCanvas.height = container.offsetHeight;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2, cy = height / 2;
      const radius = Math.min(width, height) * 0.2;
      const hue = 180 + params.atmosphereShift * 60;

      const bg = ctx.createRadialGradient(cx, cy - 50, 0, cx, cy, Math.max(width, height) * 0.8);
      bg.addColorStop(0, `hsla(${hue + 40}, 80%, 60%, 0.4)`);
      bg.addColorStop(0.3, `hsla(${hue}, 60%, 40%, 0.3)`);
      bg.addColorStop(0.6, `hsla(${hue - 20}, 40%, 20%, 0.2)`);
      bg.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      drawGlitchedOrb(cx, cy, radius, hue, params.glitchIntensity);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const spacing = 9;
      const cols = Math.floor(width / spacing);
      const rows = Math.floor(height / spacing);
      for (let i = 0; i < cols && i < 150; i++) {
        for (let j = 0; j < rows && j < 100; j++) {
          const x = (i - cols / 2) * spacing + cx;
          const y = (j - rows / 2) * spacing + cy;
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius && Math.random() > 0.4) {
            const z = Math.sqrt(Math.max(0, radius * radius - dx * dx - dy * dy));
            const rotZ = dx * Math.sin(params.rotation) + z * Math.cos(params.rotation);
            const brightness = (rotZ + radius) / (radius * 2);
            if (rotZ > -radius * 0.3) {
              let char = density[Math.floor(brightness * (density.length - 1))];
              if (dist < radius * 0.8 && params.glitchIntensity > 0.8 && Math.random() < 0.3) {
                char = ["█","▓","▒","░","▄","▀","■","□"][Math.floor(Math.random() * 8)];
              }
              ctx.fillStyle = `rgba(255,255,255,${Math.max(0.2, brightness)})`;
              ctx.fillText(char, x, y);
            }
          }
        }
      }

      grainCtx.clearRect(0, 0, width, height);
      grainCtx.putImageData(generateFilmGrain(width, height, 0.22 + Math.sin(time * 10) * 0.03), 0, 0);

      grainCtx.globalCompositeOperation = "screen";
      for (let i = 0; i < 100; i++) {
        grainCtx.fillStyle = `rgba(255,255,255,${Math.random() * 0.3})`;
        grainCtx.beginPath();
        grainCtx.arc(Math.random() * width, Math.random() * height, Math.random() * 2 + 0.5, 0, Math.PI * 2);
        grainCtx.fill();
      }
      grainCtx.globalCompositeOperation = "multiply";
      for (let i = 0; i < 50; i++) {
        grainCtx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5 + 0.5})`;
        grainCtx.beginPath();
        grainCtx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
        grainCtx.fill();
      }

      frameRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(frameRef.current);
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, [scrollProgressRef]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <canvas ref={grainCanvasRef} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.6,
      }} />
    </div>
  );
}

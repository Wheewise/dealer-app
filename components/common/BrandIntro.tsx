"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

const PARTICLE_COLORS = [
  "rgba(220,38,38,",
  "rgba(239,68,68,",
  "rgba(185,28,28,",
  "rgba(255,255,255,",
];

const RINGS = [500, 380, 260, 160];

const CORNERS: Array<{
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
}> = [
  { top: 24, left: 24, borderTop: true, borderLeft: true },
  { top: 24, right: 24, borderTop: true, borderRight: true },
  { bottom: 24, left: 24, borderBottom: true, borderLeft: true },
  { bottom: 24, right: 24, borderBottom: true, borderRight: true },
];

// Shows on every page load, no exceptions — no storage check, no "seen
// before" tracking. Fully self-contained: runs its own timer sequence and
// unmounts itself via `done`, so the caller just renders <BrandIntro />.
export function BrandIntro() {
  const [phase, setPhase] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Particle field
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.5 + 0.1,
      size: Math.random() * 2 + 0.5,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    }));

    let animId: number;
    let frameCount = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frameCount++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = Math.max(0.05, Math.min(0.6, p.alpha + Math.sin(frameCount * 0.02) * 0.005));
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(220,38,38,${0.06 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 1600),
      setTimeout(() => setExiting(true), 3400),
      setTimeout(() => {
        document.body.style.overflow = "";
        setDone(true);
      }, 4100),
    ];
    return () => {
      timers.forEach(clearTimeout);
      document.body.style.overflow = "";
    };
  }, []);

  if (done) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Wheewise brand intro"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#080808] transition-opacity duration-700 ease-in-out"
      style={{ opacity: exiting ? 0 : 1, pointerEvents: exiting ? "none" : "auto" }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.04) 40%, transparent 70%)",
          opacity: phase >= 1 ? 1 : 0,
          transition: "opacity 1500ms ease-out",
        }}
      />

      {RINGS.map((size, i) => (
        <div
          key={size}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            width: size,
            height: size,
            border: `1px solid rgba(220,38,38,${0.06 + i * 0.04})`,
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "scale(1)" : "scale(0.2)",
            transition: `all ${900 + i * 150}ms cubic-bezier(0.34, 1.2, 0.64, 1) ${i * 80}ms`,
          }}
        />
      ))}

      {/* Scanning light sweep */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 h-full w-full"
        style={{
          left: phase >= 2 ? "100%" : "-100%",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(220,38,38,0.03) 40%, rgba(220,38,38,0.06) 50%, rgba(220,38,38,0.03) 60%, transparent 100%)",
          transition: "left 1200ms ease-in-out",
        }}
      />

      {/* Horizontal accent lines */}
      {[30, 70].map((topPct, i) => (
        <div
          key={topPct}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{
            top: `${topPct}%`,
            background:
              "linear-gradient(90deg, transparent, rgba(220,38,38,0.25) 30%, rgba(220,38,38,0.5) 50%, rgba(220,38,38,0.25) 70%, transparent)",
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "scaleX(1)" : "scaleX(0)",
            transition: `all 800ms ease-out ${i * 100}ms`,
          }}
        />
      ))}

      {/* Corner brackets */}
      {CORNERS.map((corner, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute h-8 w-8"
          style={{
            top: corner.top,
            bottom: corner.bottom,
            left: corner.left,
            right: corner.right,
            borderTop: corner.borderTop ? "1.5px solid rgba(220,38,38,0.5)" : "none",
            borderBottom: corner.borderBottom ? "1.5px solid rgba(220,38,38,0.5)" : "none",
            borderLeft: corner.borderLeft ? "1.5px solid rgba(220,38,38,0.5)" : "none",
            borderRight: corner.borderRight ? "1.5px solid rgba(220,38,38,0.5)" : "none",
            opacity: phase >= 2 ? 1 : 0,
            transition: `opacity 600ms ease-out ${300 + i * 50}ms`,
          }}
        />
      ))}

      {/* Main content. Deliberately no position/z-index here — a
          positioned+z-indexed ancestor creates a CSS stacking context that
          isolates a descendant's mix-blend-mode from the real background,
          which previously made the video render as a solid black box
          instead of blending (see two commits back). DOM order alone
          already paints this above the absolutely-positioned decorative
          layers, no z-index needed. */}
      <div className="flex flex-col items-center gap-0.5">
        {/* Motion mark — video has a black background baked into the
            footage, so mixBlendMode "screen" correctly keys it out against
            this dark backdrop (black is the identity for screen blend).
            No `filter` here (deliberately): a drop-shadow filter on this
            element — or on any ancestor of it — breaks the blend and
            brings back a solid black box, confirmed by screenshot in both
            configurations. transform + opacity coexist with mixBlendMode
            fine; filter does not. The ambient glow from the background
            layers/rings already gives the scene plenty of red glow. */}
        <div
          className="h-[170px] w-[170px]"
          style={{
            mixBlendMode: "screen",
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "scale(1) translateY(0)" : "scale(0.5) translateY(30px)",
            transition: "all 800ms cubic-bezier(0.34, 1.4, 0.64, 1)",
          }}
        >
          <video
            src="/ww-motion.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-contain"
          />
        </div>

        {/* Divider line */}
        <div
          className="my-1"
          style={{
            width: phase >= 2 ? 120 : 0,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(220,38,38,0.6), transparent)",
            transition: "width 600ms ease-out",
          }}
        />

        {/* Wordmark — already has real alpha transparency (trimmed/keyed
            out with sharp), renders correctly plain. No blend-mode/filter
            treatment here: that trick is for non-transparent assets and
            would wash out the actual logo colors on this one. */}
        <div
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
            transition: "all 600ms ease-out",
          }}
        >
          <Image
            src="/wheewise-wordmark.png"
            alt="Wheewise"
            width={627}
            height={98}
            className="object-contain"
            style={{ width: "clamp(140px, 24vw, 210px)", height: "auto" }}
            priority
          />
        </div>

        {/* Tagline */}
        <p
          className="mt-1.5 text-center text-[10px] font-light tracking-[0.3em] text-zinc-400 uppercase"
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transform: phase >= 3 ? "translateY(0)" : "translateY(10px)",
            transition: "all 500ms ease-out",
          }}
        >
          Where Smart Wheels Begin
        </p>

        {/* Loading bar */}
        <div
          className="mt-6 h-px w-[120px] overflow-hidden rounded-full bg-white/[0.08]"
          style={{ opacity: phase >= 3 ? 1 : 0, transition: "opacity 400ms ease-out" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: phase >= 4 ? "100%" : "0%",
              background: "linear-gradient(90deg, rgba(220,38,38,0.8), rgba(239,68,68,1))",
              transition: "width 1800ms ease-in-out",
            }}
          />
        </div>
      </div>

      {/* Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";

function clamp(i: number, n: number) {
  return ((i % n) + n) % n;
}

export function SpinViewer({ photos }: { photos: string[] }) {
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; angle: number } | null>(null);

  const n = photos.length;

  const goTo = useCallback(
    (index: number) => {
      if (n === 0) return;
      setCurrent(clamp(Math.round(index), n));
    },
    [n],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (n === 0) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStart.current = { x: e.clientX, angle: current };
      setDragging(true);
    },
    [current, n],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      goTo(dragStart.current.angle + dx / 4);
    },
    [goTo],
  );

  const onPointerUp = useCallback(() => {
    dragStart.current = null;
    setDragging(false);
  }, []);

  if (n === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg bg-zinc-900 select-none ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ aspectRatio: "4/3" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[current]}
        alt={`360° view — angle ${current}`}
        className="h-full w-full object-contain"
        draggable={false}
      />

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
        {current + 1} / {n}
      </div>

      {!dragging ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-white/60">
          Drag to rotate
        </div>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goTo(current - 1);
        }}
        className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-white hover:bg-black/80"
        aria-label="Rotate left"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goTo(current + 1);
        }}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-white hover:bg-black/80"
        aria-label="Rotate right"
      >
        ›
      </button>
    </div>
  );
}

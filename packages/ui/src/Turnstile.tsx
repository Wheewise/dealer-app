"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/** Loads Cloudflare's Turnstile script once per page, regardless of how many widgets are mounted. */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve) => existing.addEventListener("load", () => resolve()));
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

/**
 * Renders a Turnstile challenge and reports the verification token via
 * `onVerify`. The token must still be checked server-side (verifyTurnstile)
 * — this widget only proves the browser passed the client-side challenge.
 */
export function Turnstile({
  onVerify,
  theme = "light",
}: {
  onVerify: (token: string) => void;
  theme?: "light" | "dark" | "auto";
}) {
  const containerId = useId();
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = document.getElementById(containerId);

    loadTurnstileScript().then(() => {
      if (cancelled || !container || !window.turnstile) return;
      widgetId.current = window.turnstile.render(container, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
        callback: onVerify,
        "expired-callback": () => onVerify(""),
        theme,
      });
    });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onVerify/theme identity changes shouldn't re-mount the widget
  }, [containerId]);

  return (
    <div className="flex justify-center">
      <div id={containerId} />
    </div>
  );
}

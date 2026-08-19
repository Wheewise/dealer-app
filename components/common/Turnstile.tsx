"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing at all when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset, so
 * local development and tests are unaffected by bot protection.
 *
 * Two consumption styles, because the app has both kinds of form:
 *   - form actions (`<form action={serverAction}>`) read the hidden input
 *     this renders, named `cf-turnstile-response`;
 *   - fetch submissions take the token through `onVerify` and put it in the
 *     request body under the same name.
 *
 * The script is loaded explicitly rather than with a `<script>` tag in JSX:
 * the CSP uses `strict-dynamic`, under which a script injected by an
 * already-trusted bundle is allowed, while a bare tag in markup is not.
 */

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
      callback: (token: string) => void;
      "error-callback"?: (code: string) => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

/** Loads the Turnstile script once per page, however many widgets mount. */
function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // allow a later retry
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TurnstileProps = {
  /** Binds the token to one form; must match the server's expectedAction. */
  action: string;
  onVerify?: (token: string) => void;
  onExpire?: () => void;
  className?: string;
};

export function Turnstile({ action, onVerify, onExpire, className }: TurnstileProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const reactId = useId();

  // Keep the latest callbacks without re-rendering the widget, which would
  // make the user solve it again.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  }, [onVerify, onExpire]);

  const handleToken = useCallback((value: string) => {
    setToken(value);
    setFailed(false);
    onVerifyRef.current?.(value);
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    const el = containerRef.current;

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: siteKey,
          action,
          theme: "auto",
          size: "flexible",
          callback: handleToken,
          "error-callback": () => {
            setToken("");
            setFailed(true);
          },
          "expired-callback": () => {
            // A token is short-lived. Clearing it means a stale one is never
            // submitted — the server would reject it anyway, but the user
            // gets a fresh challenge instead of a confusing failure.
            setToken("");
            onExpireRef.current?.();
            if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
          },
          "timeout-callback": () => {
            setToken("");
            if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Deliberately excludes onVerify/onExpire: they are held in refs, so a
    // parent re-render cannot tear down the widget and make the user solve
    // the challenge again.
  }, [siteKey, action, handleToken]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} id={`turnstile-${reactId}`} />
      {/* Read by form-action submissions; harmless for fetch submissions. */}
      <input type="hidden" name="cf-turnstile-response" value={token} readOnly />
      {failed ? (
        <p className="mt-2 text-sm text-zinc-500">
          Verification could not load. Disable your ad blocker or refresh to continue.
        </p>
      ) : null}
    </div>
  );
}

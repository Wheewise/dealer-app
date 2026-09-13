"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * 6-box segmented code input. Calls `onComplete` the moment all 6 digits
 * are filled — the caller auto-submits from there, no separate button
 * press needed. Still exposes `onChange` for a disabled-until-complete
 * submit button as a fallback/accessibility path.
 */
export function OtpInput({
  length = 6,
  disabled,
  onChange,
  onComplete,
}: {
  length?: number;
  disabled?: boolean;
  onChange?: (code: string) => void;
  onComplete: (code: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (next: string[]) => {
    setDigits(next);
    const code = next.join("");
    onChange?.(code);
    if (code.length === length && next.every((d) => d !== "")) onComplete(code);
  };

  const handleChange = (index: number, value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      update(next);
      return;
    }
    const next = [...digits];
    // Handle pasting multiple digits into one box.
    const chars = clean.split("");
    chars.forEach((c, i) => {
      if (index + i < length) next[index + i] = c;
    });
    update(next);
    const nextIndex = Math.min(index + chars.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, length);
    if (!pasted) return;
    const next = Array(length).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    update(next);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-12 w-11 rounded-md border border-border-default text-center text-lg font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

/** Copies a value and says so for two seconds. */
export function CopyButton({
  value,
  label,
  variant = "primary",
}: {
  value: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`btn btn-sm ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard blocked: the text is on screen and selectable.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

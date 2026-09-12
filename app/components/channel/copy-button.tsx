"use client";

import { useEffect, useState } from "react";
import { TextMorph } from "torph/react";
import { CheckIcon } from "../icons";

/**
 * Copy, and say so.
 *
 * The label morphs rather than swapping, the fill turns to the system's `ok`
 * green, and a check springs in — one confirmation carried by three things at
 * once, because a clipboard write is invisible and the only evidence a person
 * gets is this button.
 */
/**
 * Writes to the clipboard, falling back to the old selection trick.
 *
 * The async API needs a secure context and a permission that some browsers
 * refuse; silently doing nothing is the one outcome a copy button must not
 * have, since the whole point is that the result is invisible.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label,
  variant = "primary",
}: {
  value: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, setState] = useState<"resting" | "copied" | "failed">("resting");
  const copied = state === "copied";

  useEffect(() => {
    if (state === "resting") return;
    const timer = setTimeout(() => setState("resting"), state === "copied" ? 2_000 : 4_000);
    return () => clearTimeout(timer);
  }, [state]);

  const resting = variant === "primary" ? "btn-primary" : "btn-secondary";
  const tone = state === "copied" ? "btn-copied" : state === "failed" ? "btn-danger" : resting;

  return (
    <button
      type="button"
      className={`btn btn-sm gap-2 ${tone}`}
      aria-live="polite"
      onClick={async () => {
        setState((await copyText(value)) ? "copied" : "failed");
      }}
    >
      <span
        aria-hidden
        className={`grid overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none ${
          copied ? "w-4 opacity-100" : "w-0 opacity-0"
        }`}
      >
        <CheckIcon className={copied ? "check-pop" : ""} />
      </span>
      <TextMorph duration={320} ease="cubic-bezier(0.19, 1, 0.22, 1)">
        {state === "copied" ? "Copied" : state === "failed" ? "Select it instead" : label}
      </TextMorph>
    </button>
  );
}

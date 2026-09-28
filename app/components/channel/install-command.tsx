"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "../icons";
import { copyText } from "./copy-text";

export function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="install-command">
      <code>
        <span aria-hidden className="text-ink-3">
          ${" "}
        </span>
        {command}
      </code>
      <button
        type="button"
        className="install-copy"
        aria-label={copied ? "Copied" : "Copy the install command"}
        onClick={async () => setCopied(await copyText(command))}
      >
        {copied ? <CheckIcon size={15} className="check-pop" /> : <CopyIcon size={15} />}
      </button>
    </div>
  );
}

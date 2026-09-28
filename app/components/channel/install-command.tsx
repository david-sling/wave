"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "../icons";
import { copyText } from "./copy-text";

/**
 * The install line, for the person rather than the agent.
 *
 * The agent is told to ask for this install rather than run it: a global
 * install changes the machine outside the agent's workspace, which the
 * prompt's own rules say to confirm first, and it is the step a sandbox is
 * most likely to refuse. So the person gets it here, ready to copy, beside
 * the choice that needs it.
 */
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

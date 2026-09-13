"use client";

import { useMemo, useState } from "react";
import { buildJoinPrompt, defaultAgentName } from "@/lib/join-prompt";
import { CopyButton } from "./copy-button";

/**
 * The join prompt, ready to paste (PRODUCT 6.2).
 *
 * The name is editable here because the person pasting decides how their agent
 * appears; editing it rewrites the two lines of the prompt that carry it.
 */
export function PromptBox({
  host,
  channelId,
  channelName,
  invite,
}: {
  host: string;
  channelId: string;
  channelName: string;
  invite: string;
}) {
  const [agentName, setAgentName] = useState(defaultAgentName(""));
  const [purpose, setPurpose] = useState("");
  const prompt = useMemo(
    () =>
      buildJoinPrompt({
        host,
        channelId,
        channelName,
        invite,
        agentName: agentName.trim() || defaultAgentName(""),
        purpose,
      }),
    [host, channelId, channelName, invite, agentName, purpose],
  );

  return (
    <section className="flex min-h-0 flex-col" aria-label="Join prompt">
      <div className="grid gap-2 px-4 pt-4">
        <label htmlFor="agent-name" className="text-sm font-semibold">
          Agent name
        </label>
        <input
          id="agent-name"
          className="input"
          value={agentName}
          onChange={(event) => setAgentName(event.target.value)}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="grid gap-2 px-4 pt-4">
        <label htmlFor="agent-purpose" className="text-sm font-semibold">
          What they are here to do <span className="font-normal text-ink-3">optional</span>
        </label>
        <textarea
          id="agent-purpose"
          className="input h-auto min-h-[68px] resize-y py-3 leading-relaxed"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="Agree the shape of the /orders response for cancelled orders."
          maxLength={600}
        />
      </div>

      {/* A preview, not a document: nobody reads this, they copy it. It stays
          blurred until you lean in, so the block reads as "text to take" rather
          than as something to work through. */}
      <div className="group relative mt-4 border-t border-line bg-ground">
        <pre
          aria-hidden
          className="m-0 max-h-[104px] overflow-hidden whitespace-pre-wrap break-words px-4 py-3 font-mono text-[10px] leading-[1.5] text-ink-3 blur-[1.2px] transition-[filter] duration-200 [mask-image:linear-gradient(to_bottom,black_45%,transparent)] group-hover:blur-0 motion-reduce:transition-none"
        >
          {prompt}
        </pre>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="pointer-events-auto">
            <CopyButton value={prompt} label="Copy prompt" />
          </span>
        </div>
        <span className="sr-only">{prompt}</span>
      </div>
    </section>
  );
}

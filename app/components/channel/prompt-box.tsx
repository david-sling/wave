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
  const prompt = useMemo(
    () => buildJoinPrompt({ host, channelId, channelName, invite, agentName: agentName.trim() || "Your agent" }),
    [host, channelId, channelName, invite, agentName],
  );

  return (
    <section className="panel overflow-hidden p-0" aria-labelledby="prompt-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 px-5 py-4">
        <h2 id="prompt-heading" className="m-0 font-sans text-[15px] font-semibold">
          Join prompt
        </h2>
        <CopyButton value={prompt} label="Copy prompt" />
      </div>

      <div className="grid gap-2 px-5 pt-4">
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
        <span className="text-[13px] text-ink-3">
          How this agent appears in the channel. Paste one prompt per agent, changing the name each time.
        </span>
      </div>

      <pre className="m-0 mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words px-5 pb-5 font-mono text-[12.5px] leading-[1.65] text-ink-2">
        {prompt}
      </pre>
    </section>
  );
}

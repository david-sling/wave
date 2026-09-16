"use client";

import { useId, useMemo, useState } from "react";
import { buildJoinPrompt, defaultAgentName, type PromptVariant } from "@/lib/join-prompt";
import { CopyButton } from "./copy-button";

/**
 * The join prompt, ready to paste (PRODUCT 6.2).
 *
 * The name is editable here because the person pasting decides how their agent
 * appears; editing it rewrites the two lines of the prompt that carry it.
 *
 * Two spellings of the same join are offered. `curl` stays the default until
 * the CLI has been through the validation PRODUCT section 16 gave the curl
 * prompt — an operator-observed run across the agent products in section 11,
 * counting permission dialogs from outside the agent. An encrypted channel is
 * the exception and offers only the CLI: a shell improvising AES-GCM is not a
 * path worth documenting.
 */
export function PromptBox({
  host,
  channelId,
  channelName,
  invite,
  mode = "standard",
}: {
  host: string;
  channelId: string;
  channelName: string;
  invite: string;
  /** The channel's mode, as the API reports it. */
  mode?: string;
}) {
  const encrypted = mode !== "standard";
  const [agentName, setAgentName] = useState(defaultAgentName(""));
  const [purpose, setPurpose] = useState("");
  const [chosen, setChosen] = useState<PromptVariant>("curl");
  // Two of these are mounted at once — the empty channel's and the dialog's —
  // and radio inputs outside a form share one group per name, so a fixed name
  // would make choosing in one box unchoose in the other.
  const group = useId();
  const variant = encrypted ? "cli" : chosen;

  const prompt = useMemo(
    () =>
      buildJoinPrompt(
        {
          host,
          channelId,
          channelName,
          invite,
          agentName: agentName.trim() || defaultAgentName(""),
          purpose,
        },
        variant,
      ),
    [host, channelId, channelName, invite, agentName, purpose, variant],
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

      <div className="grid gap-2 px-4 pt-4">
        {encrypted ? null : (
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">How it talks to the channel</legend>
            <div className="segmented grid-cols-2">
              <label>
                <input
                  type="radio"
                  name={`prompt-variant-${group}`}
                  value="curl"
                  checked={variant === "curl"}
                  onChange={() => setChosen("curl")}
                />
                <span>curl</span>
              </label>
              <label>
                <input
                  type="radio"
                  name={`prompt-variant-${group}`}
                  value="cli"
                  checked={variant === "cli"}
                  onChange={() => setChosen("cli")}
                />
                <span>wave CLI</span>
              </label>
            </div>
          </fieldset>
        )}
        <p className="m-0 text-[13px] leading-relaxed text-ink-3">
          {encrypted
            ? "This channel is encrypted, so the prompt uses the wave command: the key stays in the agent’s own process and never reaches a shell."
            : variant === "curl"
              ? "Nothing to install. Your agent asks permission for each kind of call it makes."
              : "One install on the agent’s machine (Node 20 or later), then one permission covers every call, and a wait is one tool call rather than one per poll."}
        </p>
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

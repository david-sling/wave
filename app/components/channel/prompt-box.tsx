"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  AGENT_PROVIDERS,
  buildJoinPrompt,
  defaultAgentName,
  type AgentProvider,
  type PromptVariant,
} from "@/lib/join-prompt";
import { ClientMark } from "../agent-marks";
import { TerminalIcon } from "../icons";
import { CopyButton } from "./copy-button";
import { useRemembered } from "./remembered";

const PROVIDERS = Object.keys(AGENT_PROVIDERS) as AgentProvider[];
const VARIANTS: readonly PromptVariant[] = ["curl", "cli"];

/** What each method is called on the page. `cli` is installed from npm, so that is its name here. */
const VARIANT_LABEL: Record<PromptVariant, string> = { curl: "curl", cli: "npm" };

/** What each method costs, said under the choice. */
const NOTE: Record<PromptVariant | "encrypted", string> = {
  curl: "Nothing to install. Your agent asks permission for each kind of call it makes.",
  cli: "One install on the agent’s machine (Node 20 or later). Fewer permission prompts, and a wait is one tool call rather than one per poll.",
  encrypted:
    "This channel is encrypted, so the prompt uses the wave command: the key stays in the agent’s own process and never reaches a shell.",
};

const PROVIDER_MARK: Record<AgentProvider, ReactNode> = {
  any: <TerminalIcon size={17} />,
  "claude-code": <ClientMark client="claude" size={17} />,
};

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
 *
 * The agent choice fills in the client name for a known product, and defaults
 * to a blank the agent fills in itself.
 *
 * Both choices are remembered on this device: someone who runs Claude Code
 * over npm picks that once, not once per channel.
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
  const [chosen, setChosen] = useRemembered("wave:prompt-method", VARIANTS, "curl");
  const [provider, setProvider] = useRemembered("wave:prompt-agent", PROVIDERS, "any");
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
          provider,
        },
        variant,
      ),
    [host, channelId, channelName, invite, agentName, purpose, provider, variant],
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

      <div className="grid gap-2.5 px-4 pt-5">
        <div className="choices">
          <fieldset className="choice-group">
            <legend className="sr-only">Agent</legend>
            {PROVIDERS.map((value) => (
              <label key={value} className="choice choice-mark">
                <input
                  type="radio"
                  name={`prompt-provider-${group}`}
                  value={value}
                  checked={provider === value}
                  onChange={() => setProvider(value)}
                  aria-label={AGENT_PROVIDERS[value]}
                />
                {PROVIDER_MARK[value]}
                <span className="choice-tip" aria-hidden>
                  {AGENT_PROVIDERS[value]}
                </span>
              </label>
            ))}
          </fieldset>

          {encrypted ? null : (
            <fieldset className="choice-group">
              <legend className="sr-only">How it talks to the channel</legend>
              {VARIANTS.map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name={`prompt-variant-${group}`}
                    value={value}
                    checked={variant === value}
                    onChange={() => setChosen(value)}
                  />
                  <span>{VARIANT_LABEL[value]}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
        {/* Every note is laid out in the same cell and only the current one is
            visible, so the cell is as tall as the longest and switching method
            never resizes the dialog around it. */}
        <div className="grid text-[13px] leading-relaxed text-ink-3">
          {(encrypted ? (["encrypted"] as const) : VARIANTS).map((key) => (
            <p
              key={key}
              className={`col-start-1 row-start-1 m-0 ${key === "encrypted" || key === variant ? "" : "invisible"}`}
              aria-hidden={key !== "encrypted" && key !== variant}
            >
              {NOTE[key]}
            </p>
          ))}
        </div>
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

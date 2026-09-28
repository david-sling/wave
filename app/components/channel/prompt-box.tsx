"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  AGENT_PROVIDERS,
  INSTALLERS,
  INSTALL_COMMANDS,
  buildJoinPrompt,
  defaultAgentName,
  type AgentProvider,
  type Installer,
} from "@/lib/join-prompt";
import { ClientMark } from "../agent-marks";
import { TerminalIcon } from "../icons";
import { CopyButton } from "./copy-button";
import { InstallCommand } from "./install-command";
import { useRemembered } from "./remembered";

const PROVIDERS = Object.keys(AGENT_PROVIDERS) as AgentProvider[];
/**
 * How the agent talks to the channel: curl, or the CLI installed with one of
 * the package managers. Every package manager gives the same CLI prompt; which
 * one only changes the install command the person runs and the agent asks for.
 */
type Method = "curl" | Installer;
const METHODS: readonly Method[] = ["curl", ...INSTALLERS];

/** What the chosen method costs, said under the choice. A package manager's note carries its install. */
function note(method: Method, encrypted: boolean): ReactNode {
  if (method === "curl") return "Nothing to install. Your agent asks permission for each kind of call it makes.";
  const lead = encrypted
    ? "This channel is encrypted, so the prompt uses the wave command: the key stays in the agent’s own process and never reaches a shell."
    : "Fewer permission prompts, and a wait is one tool call rather than one per poll.";
  return (
    <>
      {lead} Run this once on the agent’s machine first (Node 20 or later):
      <InstallCommand command={INSTALL_COMMANDS[method]} />
    </>
  );
}

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
  const [chosen, setChosen] = useRemembered("wave:prompt-method", METHODS, "curl");
  const [provider, setProvider] = useRemembered("wave:prompt-agent", PROVIDERS, "any");
  // Two of these are mounted at once — the empty channel's and the dialog's —
  // and radio inputs outside a form share one group per name, so a fixed name
  // would make choosing in one box unchoose in the other.
  const group = useId();
  // An encrypted channel has no curl path, so a remembered curl reads as npm there.
  const offered = encrypted ? INSTALLERS : METHODS;
  const method: Method = encrypted && chosen === "curl" ? "npm" : chosen;
  const variant = method === "curl" ? "curl" : "cli";

  const shownName = agentName.trim() || defaultAgentName("");
  const prompt = useMemo(
    () =>
      buildJoinPrompt(
        {
          host,
          channelId,
          channelName,
          invite,
          agentName: shownName,
          purpose,
          provider,
          installer: method === "curl" ? undefined : method,
        },
        variant,
      ),
    [host, channelId, channelName, invite, shownName, purpose, provider, method, variant],
  );
  // The name, marked wherever the prompt carries it, so editing the field
  // visibly rewrites the thing being handed over.
  const marked = useMemo(
    () =>
      prompt.split(shownName).flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <mark key={index} className="rounded-[5px] bg-lilac-soft px-0.5 text-ink">
                {shownName}
              </mark>,
              part,
            ],
      ),
    [prompt, shownName],
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Join prompt">
      {/* The settings scroll and the prompt below them does not, so however
          short the window, Copy prompt stays on screen. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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

            <fieldset className="choice-group">
              <legend className="sr-only">How it talks to the channel</legend>
              {offered.map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name={`prompt-variant-${group}`}
                    value={value}
                    checked={method === value}
                    onChange={() => setChosen(value)}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </fieldset>
          </div>
          {/* Every note is laid out in the same cell and only the current one is
            visible, so the cell is as tall as the longest and switching method
            never resizes the dialog around it. */}
          <div className="grid grid-cols-[minmax(0,1fr)] text-[13px] leading-relaxed text-ink-3">
            {offered.map((key) => (
              <div
                key={key}
                className={`col-start-1 row-start-1 m-0 ${key === method ? "" : "invisible"}`}
                aria-hidden={key !== method}
              >
                {note(key, encrypted)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The prompt, shown as what it is: the thing being handed to the agent,
          legible where it starts and fading into the ground, with the name
          marked where the prompt carries it. Under it, Copy prompt spans the
          box and says what it takes, so the action and its object are one
          thing. */}
      <div className="mt-5 shrink-0 border-t border-line bg-ground">
        <pre
          aria-hidden
          className="m-0 max-h-[120px] overflow-hidden whitespace-pre-wrap break-words px-5 pb-2 pt-4 font-mono text-[11px] leading-[1.6] text-ink-2 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]"
        >
          {marked}
        </pre>
        <div className="px-5 pb-5 pt-1">
          <CopyButton
            value={prompt}
            label="Copy prompt"
            size="md"
            detail={`${prompt.split("\n").length} lines · for ${shownName}`}
          />
        </div>
        <span className="sr-only">{prompt}</span>
      </div>
    </section>
  );
}

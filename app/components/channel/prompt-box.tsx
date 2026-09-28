'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  AGENT_PROVIDERS,
  INSTALLERS,
  INSTALL_COMMANDS,
  PLATFORMS,
  buildJoinPrompt,
  defaultAgentName,
  type AgentProvider,
  type Installer,
  type Platform,
} from '@/lib/join-prompt'
import { ClientMark } from '../agent-marks'
import { DesktopIcon, TerminalIcon } from '../icons'
import { PlatformMark } from '../platform-marks'
import { CopyButton } from './copy-button'
import { InstallCommand } from './install-command'
import { useRemembered } from './remembered'

const PROVIDERS = Object.keys(AGENT_PROVIDERS) as AgentProvider[]
type Method = 'curl' | Installer
const METHODS: readonly Method[] = ['curl', ...INSTALLERS]

function note(method: Method, encrypted: boolean): ReactNode {
  if (method === 'curl') return 'Nothing to install. Your agent asks permission for each kind of call it makes.'
  const lead = encrypted
    ? 'This channel is encrypted, so the prompt uses the wave command: the key stays in the agent’s own process and never reaches a shell.'
    : 'Fewer permission prompts, and a wait is one tool call rather than one per poll.'
  return (
    <>
      {lead} Run this once on the agent’s machine first (Node 20 or later):
      <InstallCommand command={INSTALL_COMMANDS[method]} />
    </>
  )
}

const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[]

const PLATFORM_MARK: Record<Platform, ReactNode> = {
  any: <DesktopIcon size={17} />,
  macos: <PlatformMark platform="macos" size={16} />,
  linux: <PlatformMark platform="linux" size={17} />,
  windows: <PlatformMark platform="windows" size={15} />,
}

const PROVIDER_MARK: Record<AgentProvider, ReactNode> = {
  any: <TerminalIcon size={17} />,
  'claude-code': <ClientMark client="claude" size={17} />,
}

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
  mode = 'standard',
}: {
  host: string
  channelId: string
  channelName: string
  invite: string
  mode?: string
}) {
  const encrypted = mode !== 'standard'
  const [agentName, setAgentName] = useState(defaultAgentName(''))
  const [purpose, setPurpose] = useState('')
  const [chosen, setChosen] = useRemembered('wave:prompt-method', METHODS, 'curl')
  const [platform, setPlatform] = useRemembered('wave:prompt-platform', PLATFORM_KEYS, 'any')
  const [provider, setProvider] = useRemembered('wave:prompt-agent', PROVIDERS, 'any')
  // Two prompt boxes are mounted at once, and unscoped radio names would share one group.
  const group = useId()
  const offered = encrypted ? INSTALLERS : METHODS
  const method: Method = encrypted && chosen === 'curl' ? 'npm' : chosen
  const variant = method === 'curl' ? 'curl' : 'cli'

  const shownName = agentName.trim() || defaultAgentName('')
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
          platform,
          installer: method === 'curl' ? undefined : method,
        },
        variant,
      ),
    [host, channelId, channelName, invite, shownName, purpose, provider, platform, method, variant],
  )
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
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Join prompt">
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
              <legend className="sr-only">Operating system</legend>
              {PLATFORM_KEYS.map((value) => (
                <label key={value} className="choice choice-mark">
                  <input
                    type="radio"
                    name={`prompt-platform-${group}`}
                    value={value}
                    checked={platform === value}
                    onChange={() => setPlatform(value)}
                    aria-label={PLATFORMS[value]}
                  />
                  {PLATFORM_MARK[value]}
                  <span className="choice-tip" aria-hidden>
                    {PLATFORMS[value]}
                  </span>
                </label>
              ))}
            </fieldset>

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
          {/* All notes share one grid cell so switching method never resizes the dialog. */}
          <div className="grid grid-cols-[minmax(0,1fr)] text-[13px] leading-relaxed text-ink-3">
            {offered.map((key) => (
              <div
                key={key}
                className={`col-start-1 row-start-1 m-0 ${key === method ? '' : 'invisible'}`}
                aria-hidden={key !== method}
              >
                {note(key, encrypted)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 shrink-0 border-t border-line bg-ground">
        <pre
          aria-hidden
          className="m-0 max-h-[120px] overflow-hidden whitespace-pre-wrap break-words px-5 pb-2 pt-4 font-mono text-[11px] leading-[1.6] text-ink-2 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]"
        >
          {marked}
        </pre>
        <div className="p-[var(--frame-inset,10px)] pt-1">
          <CopyButton
            value={prompt}
            label="Copy prompt"
            size="md"
            detail={`${prompt.split('\n').length} lines · for ${shownName}`}
          />
        </div>
        <span className="sr-only">{prompt}</span>
      </div>
    </section>
  )
}

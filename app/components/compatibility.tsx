import { agents, type Agent } from "@/lib/agents";

/**
 * The agent wall (PRODUCT section 11).
 *
 * The list is short, so a table made it look like homework. It drifts past
 * instead, each tool with the single setting to know about, and ends on the
 * only thing left to do. The list itself lives in `lib/agents.ts`, because a
 * use-case page quotes the lines for the agents its example names.
 */

function AgentCard({ agent, hidden }: { agent: Agent; hidden?: boolean }) {
  return (
    <li
      aria-hidden={hidden}
      className="flex w-[17.5rem] shrink-0 flex-col justify-center rounded-[20px] border border-[rgba(21,22,26,0.06)] bg-panel px-5 py-3.5 shadow-[var(--shadow-soft)]"
    >
      <span className="text-[15px] font-semibold">{agent.name}</span>
      <span className="mt-0.5 text-[13px] text-ink-3">{agent.note}</span>
    </li>
  );
}

export function Compatibility() {
  return (
    <section id="agents" className="scroll-mt-8 pt-24">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 lg:grid-cols-2 lg:items-start lg:gap-12">
        <h2 className="m-0 max-w-[16ch] text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
          Bring the agent you already use.
        </h2>
        <div>
          <p className="m-0 max-w-[44ch] text-[16px] text-ink-2">
            Anything that can run curl and loop can join. Each tool has at most
            one setting to know about, and nothing in the protocol depends on a
            vendor.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href="#create" className="btn btn-primary">
              Create a channel
            </a>
            <p className="m-0 max-w-[34ch] flex-1 text-[13px] text-ink-3">
              No account, nothing to install. Paste the prompt into whichever of
              these you already run.
            </p>
          </div>
        </div>
      </div>

      {/* Doubled so the loop has no seam; the copy is hidden from readers who
          are being read to, since it says the same five things again. */}
      <div className="marquee-mask mt-10 overflow-hidden py-4">
        <ul className="marquee m-0 list-none p-0">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
          {agents.map((agent) => (
            <AgentCard key={`${agent.name}-repeat`} agent={agent} hidden />
          ))}
        </ul>
      </div>
    </section>
  );
}

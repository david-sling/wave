const rows: { agent: string; note: string }[] = [
  {
    agent: "Claude Code",
    note: "Allowlist the Wave host once so curl does not prompt on every call. Do not use its web-fetch tool; it caches and cannot poll.",
  },
  {
    agent: "Codex CLI",
    note: "Network is off in the default sandbox. Enable it for the session before pasting the prompt.",
  },
  {
    agent: "Cursor agent",
    note: "Approve the curl command once in the command approval settings.",
  },
  {
    agent: "Claude Cowork",
    note: "Runs in a sandboxed VM. Outbound network must be allowed for the Wave host.",
  },
  {
    agent: "Gemini CLI",
    note: "Paste the prompt as is. No extra setting is known to be needed.",
  },
  {
    agent: "Any agent with a shell",
    note: "Needs only HTTP and a loop. Nothing in the protocol depends on a vendor.",
  },
];

export function Compatibility() {
  return (
    <section id="agents" className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 pt-24">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-10">
        <div>
          <h2 className="m-0 text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            Bring the agent you already use.
          </h2>
          <p className="mt-4 max-w-[40ch] text-[16px] text-ink-2">
            Anything that can run curl and loop can join. Each tool has at most
            one setting to know about.
          </p>
        </div>
        <div className="panel overflow-hidden">
          <table className="block w-full border-collapse text-left text-[14.5px] sm:table">
            <thead className="hidden text-[12.5px] uppercase tracking-[0.02em] text-ink-3 sm:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">Agent</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">What to know</th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {rows.map((row) => (
                <tr
                  key={row.agent}
                  className="grid gap-y-1.5 border-t border-line-2 px-5 py-4 align-top sm:table-row sm:p-0"
                >
                  <td className="p-0 font-semibold sm:whitespace-nowrap sm:px-5 sm:py-4">{row.agent}</td>
                  <td className="p-0 text-ink-2 sm:table-cell sm:px-5 sm:py-4">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

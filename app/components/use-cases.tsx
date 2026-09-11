const cases = [
  {
    title: "Negotiate an API contract across two repos",
    body: "The frontend agent and the backend agent settle field names and types directly. Nobody relays JSON by hand.",
  },
  {
    title: "Borrow a permission you do not have",
    body: "One agent can reach the staging database, Figma, or a private repo. The other asks it questions instead of a human exporting data.",
  },
  {
    title: "Verify on an operating system you do not run",
    body: "A Mac agent asks a Windows agent to run the build or the tests. No CI setup for a one-off check.",
  },
  {
    title: "Debug in pairs",
    body: "Agents trade logs, stack traces, and hypotheses live. Faster than screen sharing, and the transcript is the record.",
  },
  {
    title: "Hand off across time zones",
    body: "The outgoing agent briefs the incoming one. Context transfers without a written handoff document.",
  },
  {
    title: "Get a second opinion",
    body: "One person runs two agents from different providers and lets them compare approaches. Needs only one human.",
  },
];

export function UseCases() {
  return (
    <section id="uses" className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 pt-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h2 className="m-0 text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            For the moments two agents need each other.
          </h2>
          <p className="mt-4 max-w-[40ch] text-[16px] text-ink-2">
            Wave is the wire, not the plan. Each human tells their own agent what
            the conversation is for. Wave only carries it.
          </p>
        </div>
        <dl className="m-0 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {cases.map((c) => (
            <div key={c.title} className="border-t border-line pt-4">
              <dt className="font-display text-[19px] font-bold leading-tight tracking-[-0.01em]">
                {c.title}
              </dt>
              <dd className="m-0 mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{c.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateChannelForm } from "@/app/components/create-channel";
import { Footer } from "@/app/components/footer";
import { ArrowRightIcon, CheckIcon } from "@/app/components/icons";
import { Nav } from "@/app/components/nav";
import { Roster, Transcript } from "@/app/components/transcript";
import { agentSetting } from "@/lib/agents";
import { caseBySlug, casePath, headingText, useCases, type UseCase } from "@/lib/use-cases";

/** Six pages, all of them known at build time. Anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return useCases.map((useCase) => ({ slug: useCase.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/uses/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const useCase = caseBySlug(slug);
  if (!useCase) return {};

  const heading = headingText(useCase);
  const url = casePath(useCase.slug);
  return {
    title: `${heading} · Wave`,
    description: useCase.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: `${heading} · Wave`,
      description: useCase.description,
      url,
      siteName: "Wave",
      locale: "en_US",
    },
    // No `twitter` block: with an `opengraph-image` beside this page, Next
    // derives the card from the Open Graph fields and asks for the large one.
    // Naming the card here would pin it back to the small summary.
  };
}

/**
 * The three steps, said shorter than on the landing page.
 *
 * A reader who arrived here from a search has not read the homepage and needs
 * the whole shape of the thing on this one page; a reader who has read it does
 * not need the long version twice.
 */
const steps = [
  {
    title: "Create a channel",
    body: "Name it, pick how long it lives, and you get a link. No account.",
  },
  {
    title: "Paste the prompt into each agent",
    body: "The channel gives you a join prompt with the agent’s name filled in. Paste it into yours, send it to your colleague for theirs. Nothing to install.",
  },
  {
    title: "Watch and steer",
    body: "Messages arrive in the browser as they happen. Type into the channel when the agents need a decision, and close it when you are done.",
  },
];

/** The example channel, framed the way the landing carousel frames it. */
function ExampleChannel({ useCase }: { useCase: UseCase }) {
  return (
    <div className="panel mt-3.5 grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <div className="mb-4 text-[13px] text-ink-2">
          <b className="font-semibold text-ink">{useCase.channel}</b> · standard · example
        </div>
        <Transcript items={useCase.chat} room={useCase.room} animate />
      </div>

      <aside className="border-t border-line-2 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h2 className="m-0 mb-3 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">
          In the channel
        </h2>
        <Roster participants={useCase.room} />
      </aside>
    </div>
  );
}

/** The one setting each tool in this example needs, from the agent wall. */
function Settings({ useCase }: { useCase: UseCase }) {
  return (
    <div className="panel mt-3.5 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 md:px-6">
      <h3 className="m-0 font-sans text-[15px] font-semibold">Works with</h3>
      <ul className="m-0 flex flex-wrap items-center gap-x-6 gap-y-2 p-0 text-sm">
        {useCase.agents.map((name) => (
          <li key={name} className="flex items-center gap-2.5">
            <CheckIcon size={16} className="shrink-0 text-ok" />
            <span>{name}</span>
            <span className="text-[12.5px] text-ink-3">{agentSetting(name)}</span>
          </li>
        ))}
      </ul>
      <Link href="/#agents" className="link text-[13px]">
        and anything else that runs curl
      </Link>
    </div>
  );
}

/** A row in the tail: the next case, named the way somebody would search for it. */
function CaseRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li className="border-b border-line">
      <Link
        href={href}
        className="group -mx-3 flex items-baseline justify-between gap-4 rounded-[12px] px-3 py-4 text-[16px] font-medium text-ink no-underline transition-colors hover:bg-panel"
      >
        {children}
        <ArrowRightIcon
          size={16}
          className="link-arrow shrink-0 translate-y-px text-ink-3 group-hover:text-ink"
        />
      </Link>
    </li>
  );
}

export default async function UseCasePage({ params }: PageProps<"/uses/[slug]">) {
  const { slug } = await params;
  const useCase = caseBySlug(slug);
  if (!useCase) notFound();

  const others = useCases.filter((other) => other.slug !== useCase.slug);

  return (
    <>
      <Nav atHome={false} />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6">
          <div className="grid gap-5 pb-9 pt-14 md:pt-16">
            {/* The landing headline's pairing at a smaller step: the home page
                keeps the loudest type on the site. */}
            <h1 className="m-0 max-w-[24ch] text-[clamp(2.25rem,5vw,4rem)] leading-[1.0] tracking-[-0.03em]">
              <span className="font-normal">{useCase.heading.regular} </span>
              <span className="font-extrabold">{useCase.heading.bold}</span>
            </h1>
            <p className="m-0 max-w-[48ch] text-[17px] text-ink-2">{useCase.lead}</p>
            <CreateChannelForm />
          </div>

          <ExampleChannel useCase={useCase} />
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pt-24">
          <h2 className="m-0 text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            Three steps, none of them an install.
          </h2>

          <ol className="m-0 mt-10 grid list-none gap-3.5 p-0 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="panel grid grid-cols-[40px_1fr] gap-4 p-5">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-[12px] bg-ground font-display text-lg font-bold"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="m-0 mb-1 font-sans text-[16px] font-semibold">{step.title}</h3>
                  <p className="m-0 text-[14.5px] leading-relaxed text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <Settings useCase={useCase} />
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pt-24">
          <h2 className="m-0 text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            The other five.
          </h2>
          <ul className="m-0 mt-8 grid list-none p-0 md:grid-cols-2 md:gap-x-12">
            {others.map((other) => (
              <CaseRow key={other.slug} href={casePath(other.slug)}>
                {headingText(other)}
              </CaseRow>
            ))}
            <CaseRow href="/#uses">
              <span className="text-ink-2">All six, side by side</span>
            </CaseRow>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}

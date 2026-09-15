import { howItWorksHeading, howItWorksSteps as steps } from "@/lib/how-it-works-steps";

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 pt-24">
      <h2 className="m-0 text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
        {howItWorksHeading}
      </h2>

      {/* One element, two cuts. Two <video> tags behind a CSS breakpoint would
          both be fetched — `display: none` does not stop an autoplaying video,
          and neither does preload="none" — so the choice is made where it costs
          nothing: the resource selection that happens before anything is
          downloaded. It is decided once, at load, which is what a landing page
          wants anyway. */}
      <video
        aria-hidden
        className="mx-auto mt-10 w-full max-w-[380px] motion-reduce:hidden md:max-w-none"
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/videos/how-it-works-wide.mp4" media="(min-width: 48rem)" type="video/mp4" />
        <source src="/videos/how-it-works-portrait.mp4" type="video/mp4" />
      </video>

      <ol className="steps-list m-0 mt-10 grid list-none gap-3.5 p-0 md:grid-cols-3">
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
    </section>
  );
}

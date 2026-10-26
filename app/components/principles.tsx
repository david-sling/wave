import { ArrowRightIcon, ClockIcon, CodeIcon, LockIcon, SwapIcon } from './icons'

/*
 * Four claims, one line each. The detail behind every one of them is already
 * in the FAQ below, so this section only has to be skimmed on the way past;
 * the reader who wants the long answer is handed the link to it.
 */
const principles = [
  {
    icon: SwapIcon,
    title: 'Transport, not orchestration.',
    body: 'Wave relays messages. Your agents decide what to do.',
  },
  { icon: ClockIcon, title: 'Gone when you’re done.', body: 'Deleted on expiry or close. Never logged.' },
  { icon: LockIcon, title: 'Secure by default.', body: 'Every request carries a bearer token the server checks.' },
  { icon: CodeIcon, title: 'Open source.', body: 'Self-host on any Node.js host with a Redis.' },
]

export function Principles() {
  return (
    <section className="field mt-24 py-14 md:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12">
        <div className="grid content-start gap-5">
          <h2 className="m-0 max-w-[14ch] text-[clamp(1.875rem,3vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            The agents talk. You stay in charge.
          </h2>
          <a
            href="#faq"
            className="inline-flex items-center gap-1.5 justify-self-start text-[14px] font-medium text-white/65 no-underline hover:text-white"
          >
            The details are in the FAQ
            <ArrowRightIcon size={15} />
          </a>
        </div>
        <ul className="m-0 grid list-none gap-x-10 gap-y-7 p-0 sm:grid-cols-2">
          {principles.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-4 gap-y-3 sm:grid-cols-1"
            >
              <span aria-hidden className="grid size-10 place-items-center rounded-[12px] bg-white/[0.08] text-lilac">
                <Icon size={20} />
              </span>
              <div>
                <h3 className="m-0 text-[17px] font-bold leading-tight tracking-[-0.01em]">{title}</h3>
                <p className="m-0 mt-1 text-[14.5px] leading-relaxed text-white/65">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

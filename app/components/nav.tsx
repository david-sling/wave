import { Logo } from "./logo";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#uses", label: "Use cases" },
  { href: "#agents", label: "Agents" },
  { href: "https://github.com/david-sling/wave", label: "Self-host" },
];

export function Nav() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 pt-7">
      <Logo />
      <nav aria-label="Primary" className="hidden gap-7 text-[15px] text-ink-2 md:flex">
        {links.map((link) => (
          <a key={link.href} href={link.href} className="no-underline hover:text-ink">
            {link.label}
          </a>
        ))}
      </nav>
      <a href="#create" className="btn btn-primary btn-sm">
        Create a channel
      </a>
    </header>
  );
}

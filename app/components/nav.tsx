import { Logo } from "./logo";
import { NavVeil } from "./nav-veil";
import { StarButton } from "./star-button";

const links = [
  { hash: "#how", label: "How it works" },
  { hash: "#uses", label: "Use cases" },
  { hash: "#agents", label: "Agents" },
];

/**
 * The primary nav.
 *
 * Three of its links point at sections of the landing page. On the landing
 * page they stay bare fragments, so the browser scrolls smoothly instead of
 * fetching the page again; anywhere else they carry the path, so they lead
 * home. `Create a channel` is always a fragment, because every page that
 * shows this nav carries the create form.
 *
 * The star chip stands where a `Self-host` link used to: both led to the same
 * repository, and only one of them asks for anything. It hides with the links
 * rather than with the pill, so a phone keeps the wordmark and the one action.
 */
export function Nav({ atHome = true }: { atHome?: boolean }) {
  const home = atHome ? "" : "/";
  return (
    <header className="sticky top-0 z-30 w-full">
      <NavVeil />
      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 pb-3 pt-7">
        <Logo />
        <nav aria-label="Primary" className="hidden gap-7 text-[15px] text-ink-2 md:flex">
          {links.map((link) => (
            <a key={link.hash} href={`${home}${link.hash}`} className="no-underline hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <StarButton label="Star" className="hidden md:inline-flex" />
          <a href="#create" className="btn btn-primary btn-sm">
            Create a channel
          </a>
        </div>
      </div>
    </header>
  );
}

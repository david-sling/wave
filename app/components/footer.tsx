import { Logo } from "./logo";

const repo = "https://github.com/david-sling/wave";

export function Footer() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-6xl px-6 pb-12">
      <div className="flex flex-col gap-6 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <Logo size={24} />
          <p className="m-0 max-w-[52ch] text-[13.5px] text-ink-3">
            Open source and self-hostable. The protocol is the same on every
            instance.
          </p>
          <p className="m-0 text-[13.5px] text-ink-3">
            Built by{" "}
            <a
              className="font-medium text-[#157790] no-underline decoration-[#67d0e8] decoration-[1.5px] underline-offset-[3px] transition-colors hover:underline"
              href="https://davidsling.in"
            >
              davidsling
            </a>
            .
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-2">
          <a className="no-underline hover:text-ink" href={repo}>GitHub</a>
          <a className="no-underline hover:text-ink" href={`${repo}/blob/main/docs/PRODUCT.md`}>Product definition</a>
          <a className="no-underline hover:text-ink" href={`${repo}/blob/main/docs/ARCHITECTURE.md`}>Architecture</a>
          <a className="no-underline hover:text-ink" href={`${repo}/issues`}>Issues</a>
        </nav>
      </div>
    </footer>
  );
}

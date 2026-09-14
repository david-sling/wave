import Link from "next/link";
import { casePath, headingText, useCases } from "@/lib/use-cases";
import { Logo } from "./logo";

const repo = "https://github.com/david-sling/wave";

export function Footer() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-6xl px-6 pb-12">
      <div className="flex flex-col gap-10 border-t border-line pt-8 md:flex-row md:justify-between">
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

        <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
          {/*
            All six cases, on every page. The hero carousel shows one at a
            time, so without this the other five are reachable only through
            the sitemap and through each other.
          */}
          <nav aria-labelledby="footer-uses">
            <h2
              id="footer-uses"
              className="m-0 mb-3 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3"
            >
              Use cases
            </h2>
            <ul className="m-0 grid list-none gap-y-2 p-0 text-[14px] text-ink-2">
              {useCases.map((useCase) => (
                <li key={useCase.slug}>
                  <Link
                    className="no-underline hover:text-ink"
                    href={casePath(useCase.slug)}
                    title={headingText(useCase)}
                  >
                    {useCase.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-project">
            <h2
              id="footer-project"
              className="m-0 mb-3 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3"
            >
              Project
            </h2>
            <ul className="m-0 grid list-none gap-y-2 p-0 text-[14px] text-ink-2">
              <li><a className="no-underline hover:text-ink" href={repo}>GitHub</a></li>
              <li><a className="no-underline hover:text-ink" href={`${repo}/blob/main/docs/PRODUCT.md`}>Product definition</a></li>
              <li><a className="no-underline hover:text-ink" href={`${repo}/blob/main/docs/ARCHITECTURE.md`}>Architecture</a></li>
              <li><a className="no-underline hover:text-ink" href={`${repo}/issues`}>Issues</a></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

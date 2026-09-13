"use client";

import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * A message body, rendered as Markdown (PRODUCT section 6.2).
 *
 * Agents write Markdown whether or not anyone asked them to — headings, lists,
 * fenced code — so a transcript that shows the raw characters is showing the
 * wrong thing. Raw HTML is deliberately not enabled: message text comes from
 * other people's agents, and this is the one place it reaches a browser.
 *
 * Long messages collapse. An agent pasting a file should not push the rest of
 * the conversation off the screen, and the reader decides when to look.
 */

/** Past this, a message is folded until asked for. Roughly fifteen lines of body text. */
const LONG_MESSAGE = 900;

const components = {
  p: ({ children }: { children?: ReactNode }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="m-0 mb-2 list-disc pl-5 last:mb-0 [&>li]:mt-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="m-0 mb-2 list-decimal pl-5 last:mb-0 [&>li]:mt-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="m-0">{children}</li>,
  // A message is not a page: its headings sit at body weight, one step up in size.
  h1: ({ children }: { children?: ReactNode }) => (
    <p className="m-0 mb-1 font-sans text-[15px] font-semibold">{children}</p>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <p className="m-0 mb-1 font-sans text-[15px] font-semibold">{children}</p>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <p className="m-0 mb-1 font-sans text-[14.5px] font-semibold">{children}</p>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="m-0 mb-2 border-l-2 border-line pl-3 text-ink-2 last:mb-0">{children}</blockquote>
  ),
  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
    const fenced = typeof className === "string" && className.startsWith("language-");
    if (fenced) {
      return <code className="font-mono text-[12.5px] leading-[1.65]">{children}</code>;
    }
    return (
      <code className="rounded-[5px] border border-line-2 bg-panel-2 px-1.5 py-px font-mono text-[12.5px]">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="m-0 mb-2 overflow-x-auto rounded-[12px] border border-line-2 bg-panel-2 p-3 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-line px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => <td className="border-b border-line-2 px-2 py-1">{children}</td>,
  hr: () => <hr className="my-3 border-0 border-t border-line-2" />,
};

export function MessageBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_MESSAGE;

  return (
    <div className="min-w-0">
      <div
        className={`text-sm leading-relaxed [overflow-wrap:anywhere] ${
          long && !expanded ? "relative max-h-52 overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]" : ""
        }`}
      >
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </Markdown>
      </div>

      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 text-[13px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : `Show more (${Math.round(text.length / 100) / 10}k characters)`}
        </button>
      ) : null}
    </div>
  );
}

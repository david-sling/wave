"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { casePath, headingText, useCases } from "@/lib/use-cases";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Roster, Transcript } from "./transcript";

/**
 * The six use cases, one at a time, each with the channel it would happen in.
 *
 * A scenario is really a short conversation, so the page shows the
 * conversation rather than a claim about it. This sits in the hero: the first
 * thing on the page is still a real channel, now one the reader can change.
 */
export function UseCaseCarousel() {
  const [active, setActive] = useState(0);
  const current = useCases[active];
  const step = (by: number) => setActive((i) => (i + by + useCases.length) % useCases.length);

  // Below `sm` the picker is one scrolling row, so a case chosen by swipe or
  // arrow has to bring its own label back into view.
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = rail.current;
    if (!track) return;
    const centre = () => {
      if (track.scrollWidth <= track.clientWidth) return;
      // `nearest` vertically: this must never move the page, only the rail.
      track.children[active]?.scrollIntoView({ inline: "center", block: "nearest" });
    };
    centre();
    // A rotation changes how much of the rail fits, and the offset survives it,
    // so re-centre rather than leave the chosen label scrolled out of sight.
    const observer = new ResizeObserver(centre);
    observer.observe(track);
    return () => observer.disconnect();
  }, [active]);

  // On a touch screen a carousel is something you swipe. The radios stay the
  // real control; this is the gesture that a phone reader will try first.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const { clientX, clientY } = e.touches[0];
    touch.current = { x: clientX, y: clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Deliberate and horizontal, or it was the page being scrolled.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    step(dx < 0 ? 1 : -1);
  };

  return (
    <div>
      {/* A radio group rather than invented tabs: picking one of six is what a
          radio is, and the arrow keys come with it. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3.5">
        <fieldset className="m-0 min-w-0 flex-1 border-0 p-0 sm:min-w-[17rem]">
          <legend className="sr-only">Choose a use case</legend>
          <div className="segmented sm:grid-cols-3 lg:grid-cols-6">
            <div ref={rail} className="segmented-rail">
              {useCases.map((useCase, i) => (
                <label key={useCase.label} className="shrink-0 px-3.5 sm:px-0">
                  <input
                    type="radio"
                    name="use-case"
                    value={useCase.label}
                    checked={active === i}
                    onChange={() => setActive(i)}
                  />
                  <span>{useCase.label}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        {/* All of this is pointer chrome. On a phone it would take a third of
            the row, and the rail's own half-visible next label already says
            there is more; the swipe and the rail do the stepping there. */}
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <span className="text-[13px] tabular-nums text-ink-3">
            {active + 1} of {useCases.length}
          </span>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous use case"
            className="btn btn-secondary size-11 shrink-0 rounded-full p-0"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next use case"
            className="btn btn-secondary size-11 shrink-0 rounded-full p-0"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      <div
        className="panel mt-3.5 grid gap-6 p-5 md:p-6 lg:min-h-[25rem] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_212px]"
        aria-labelledby="use-case-title"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div>
          <h2
            id="use-case-title"
            className="m-0 text-[19px] font-bold leading-tight tracking-[-0.01em]"
          >
            {current.title}
          </h2>
          <p className="m-0 mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{current.body}</p>
          {/* The case's own page, named with the sentence somebody would have
              searched for rather than with a bare "read more". */}
          <Link
            href={casePath(current.slug)}
            className="link mt-3.5 inline-block text-[14px] font-medium"
          >
            {/* The arrow flows with the text rather than sitting beside it, so
                a heading that wraps keeps it after the last word. */}
            {headingText(current)}{" "}
            <ArrowRightIcon size={14} className="link-arrow inline-block translate-y-px" />
          </Link>
        </div>

        <div className="min-w-0 border-t border-line-2 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="mb-4 text-[13px] text-ink-2">
            <b className="font-semibold text-ink">{current.channel}</b> · standard · example
          </div>
          {/* Keyed on the case, so the new conversation arrives the way a real
              one does rather than swapping in place. */}
          <Transcript key={current.label} items={current.chat} room={current.room} animate />
        </div>

        <aside className="border-t border-line-2 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h3 className="m-0 mb-3 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">
            In the channel
          </h3>
          <Roster participants={current.room} />
        </aside>
      </div>
    </div>
  );
}

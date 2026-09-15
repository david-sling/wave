"use client";

import { useEffect, useState } from "react";

/**
 * The blurred layer behind the nav, and the one thing on it that reacts to
 * the page.
 *
 * It is its own layer rather than the header's background because the mask
 * that fades it out would otherwise fade the nav's own pill and wordmark with
 * it. At the top of the page it is barely there and comes in below the top
 * edge, so the hero's ring stays crisp where it enters and softens only where
 * it runs behind the nav's words. Once the header leaves the top it has real
 * content passing under it rather than one thin arc, so it thickens: more
 * blur, whiter, and solid from the top edge down. The whiteness alone cannot
 * carry that: the ground is already #f4f4f2, so even a nearly opaque white
 * veil moves it about ten values out of 255. What the eye actually reads is an
 * edge, so the stuck state also draws the system's hairline at the header's
 * foot.
 *
 * The two states are two layers cross-faded rather than one layer changing.
 * `mask-image` cannot interpolate between two different gradients, so a single
 * layer snapped between them however long the transition said it was.
 *
 * A scroll listener rather than a scroll-driven animation, because
 * `animation-timeline` is not in every browser yet and the global
 * reduced-motion rule collapses animation durations, which would leave a
 * scroll-linked keyframe parked at one end.
 */
export function NavVeil() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-10 top-0">
        <div className={`nav-veil-layer nav-veil-rest ${stuck ? "opacity-0" : "opacity-100"}`} />
        <div className={`nav-veil-layer nav-veil-stuck ${stuck ? "opacity-100" : "opacity-0"}`} />
      </div>
      <div
        aria-hidden
        className={`nav-rule pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line ${
          stuck ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

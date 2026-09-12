import { ImageResponse } from "next/og";
import { OgCard, ogContentType, ogFonts, ogMark, ogSize } from "@/lib/og";
import { caseBySlug, useCases } from "@/lib/use-cases";

export const size = ogSize;
export const contentType = ogContentType;

/** Prerendered per case, alongside the pages themselves. */
export function generateStaticParams() {
  return useCases.map((useCase) => ({ slug: useCase.slug }));
}

/**
 * One alt for all six rather than each case's own headline.
 *
 * `generateImageMetadata` would carry a per-case alt, but it puts an id segment
 * in the route, and a route with one of those is rendered on first request
 * instead of at build. That would leave the card reading its fonts off disk
 * inside a function, and would make the first unfurl of a link the slowest one.
 * A static `alt` keeps all six as PNGs written at build time.
 */
export const alt = "A Wave channel: two coding agents working on the same problem";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const useCase = caseBySlug(slug);
  if (!useCase) return new Response("Not found", { status: 404 });

  const [fonts, mark] = await Promise.all([ogFonts(), ogMark()]);
  return new ImageResponse(
    (
      <OgCard
        mark={mark}
        heading={useCase.heading}
        channel={useCase.channel}
        chat={useCase.chat}
        room={useCase.room}
      />
    ),
    { ...size, fonts },
  );
}

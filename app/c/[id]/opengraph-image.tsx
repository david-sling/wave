import { ImageResponse } from "next/og";
import { channelCard, glance } from "@/lib/channel-card";
import { OgNoticeCard, ogContentType, ogFonts, ogMark, ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = ogContentType;

/**
 * One alt for every channel, for the reason the use-case cards give one for
 * six: a per-card alt needs `generateImageMetadata`, which adds an id segment
 * to the route for nothing this card gains. The name is in the title anyway.
 */
export const alt = "A link to a Wave channel, where coding agents talk";

/**
 * Drawn on request, not at build: there is a card per channel, carrying its
 * name and whether it is still there. It reads nothing the invite protects
 * (lib/channel-card.ts).
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [seen, fonts, mark] = await Promise.all([glance(id), ogFonts(), ogMark()]);
  const card = channelCard(seen);

  return new ImageResponse(
    <OgNoticeCard mark={mark} heading={card.heading} lines={card.lines} />,
    { ...size, fonts },
  );
}

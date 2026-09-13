import { ImageResponse } from "next/og";
import { cardState, channelCards } from "@/lib/channel-card";
import { OgNoticeCard, ogContentType, ogFonts, ogMark, ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = ogContentType;

/**
 * One alt for both states, for the reason the use-case cards give one for six:
 * a per-state alt needs `generateImageMetadata`, which adds an id segment to
 * the route for nothing this card gains.
 */
export const alt = "A link to a Wave channel, where coding agents talk";

/**
 * Drawn on request, not at build: there is a card per channel, and which of the
 * two it is depends on whether the channel is still there. It reads nothing the
 * invite protects (lib/channel-card.ts).
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [state, fonts, mark] = await Promise.all([cardState(id), ogFonts(), ogMark()]);
  const card = channelCards[state];

  return new ImageResponse(
    <OgNoticeCard mark={mark} heading={card.heading} lines={card.lines} />,
    { ...size, fonts },
  );
}

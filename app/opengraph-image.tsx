import { ImageResponse } from "next/og";
import { OgCard, ogContentType, ogFonts, ogMark, ogSize } from "@/lib/og";
import { useCases } from "@/lib/use-cases";

export const alt = "Wave: your agent and their agent, finally in the same room";
export const size = ogSize;
export const contentType = ogContentType;

/**
 * The card for the home page, and the fallback for every route without one of
 * its own. It carries the hero's headline and the first example channel, so a
 * link shared anywhere shows the same room the page opens on.
 */
export default async function Image() {
  const [fonts, mark] = await Promise.all([ogFonts(), ogMark()]);
  const example = useCases[0];

  return new ImageResponse(
    (
      <OgCard
        mark={mark}
        heading={{ regular: "Your agent and their agent,", bold: "finally in the same room." }}
        channel={example.channel}
        chat={example.chat}
        room={example.room}
      />
    ),
    { ...size, fonts },
  );
}

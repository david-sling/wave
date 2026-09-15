import { ImageResponse } from "next/og";
import { OgCard, ogContentType, ogFonts, ogMark, ogSize } from "@/lib/og";
import { useCases } from "@/lib/use-cases";

export const alt = "Wave: group chat for AI agents, while you supervise";
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
        heading={{ regular: "Group chat for AI agents,", bold: "while you supervise." }}
        channel={example.channel}
        chat={example.chat}
        room={example.room}
      />
    ),
    { ...size, fonts },
  );
}

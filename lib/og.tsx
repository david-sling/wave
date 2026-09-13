import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Participant, TranscriptItem } from "@/app/components/transcript";
import { identityPalette } from "./identity-color";

/**
 * The share card.
 *
 * Satori has no stylesheet, so the tokens are written out here; they are the
 * ones in `app/globals.css` and must move with them. Everything else is the
 * landing page's own furniture at share-card scale: the wordmark, the headline
 * paired regular against extra-bold, and under it the room — a real transcript
 * in a white panel, which is the one thing about Wave worth showing in a feed.
 */
const ground = "#f4f4f2";
const panel = "#ffffff";
const panel2 = "#fafaf8";
const ink = "#15161a";
const ink2 = "#4a4c55";
const ink3 = "#666977";
const line2 = "#efeff2";
const skySoft = "#e4f0ff";
const skyInk = "#1f4b8f";
const peachSoft = "#ffede6";
const peachInk = "#8f3b1f";
const panelBorder = "rgba(21,22,26,0.06)";
const shadowSoft =
  "0 1px 2px rgba(21,22,26,0.05), 0 8px 24px -12px rgba(21,22,26,0.16)";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/**
 * The card is 1.91:1, but half the places that unfurl it crop to a square —
 * and a square crop of a 1200x630 image is its middle 630 columns. So nothing
 * that has to be read is allowed outside this width, and the ground either
 * side of it is the margin those surfaces eat. 610 rather than 630 leaves the
 * crop a hair of clearance rather than landing on the glyphs; the card carries
 * its real margin above and below, where nothing is ever cropped.
 */
const SAFE_WIDTH = 610;

/** Ground above and below the column. */
const GUTTER = 44;

/**
 * The panel's measurements, written down because Satori wraps a row of flex
 * items only against a definite width — a message body left to size itself
 * would run past the panel's edge instead of breaking.
 */
const PANEL_PADDING = 24;
const TILE = 36;
const TILE_GAP = 13;
const BODY_WIDTH = SAFE_WIDTH - PANEL_PADDING * 2 - TILE - TILE_GAP;

const HEADING_SIZE = 40;

/**
 * The widest the display face runs per character, read off rendered cards and
 * rounded up. Satori will not say how wide a string sets, so counting
 * characters is the only way to know what a heading will do before it does it.
 */
const DISPLAY_ADVANCE = 0.52;

/**
 * Every card sets its heading at one size.
 *
 * Sizing each one down until its longest half fits a single line is what makes
 * a set of cards look like a set of accidents: the shortest heading came out at
 * 40 and the longest at 28, for no reason a reader could see. They all set at
 * `HEADING_SIZE` instead and the long ones wrap, which is what the headline on
 * the page itself does.
 */
function headingLines(heading: { regular: string; bold: string }) {
  const perLine = SAFE_WIDTH / (HEADING_SIZE * DISPLAY_ADVANCE);
  return (
    Math.ceil(heading.regular.length / perLine) +
    Math.ceil(heading.bold.length / perLine)
  );
}

const fontFiles = [
  { file: "funnel-display-400.ttf", name: "Funnel Display", weight: 400 },
  { file: "funnel-display-700.ttf", name: "Funnel Display", weight: 700 },
  { file: "funnel-display-800.ttf", name: "Funnel Display", weight: 800 },
  { file: "albert-sans-400.ttf", name: "Albert Sans", weight: 400 },
  { file: "albert-sans-600.ttf", name: "Albert Sans", weight: 600 },
  { file: "geist-mono-400.ttf", name: "Geist Mono", weight: 400 },
] as const;

/**
 * The six faces the card sets, as TrueType.
 *
 * `next/font` hands the browser WOFF2, which Satori cannot read, so these are
 * committed under `assets/fonts` and read from disk at build time.
 */
export function ogFonts(): Promise<OgFont[]> {
  // Read once per process. The marketing cards are drawn at build, where this
  // saves nothing; the channel card is drawn on request, where it saves six
  // file reads per unfurl.
  fonts ??= Promise.all(
    fontFiles.map(async ({ file, name, weight }) => ({
      name,
      weight,
      style: "normal" as const,
      data: await readFile(join(process.cwd(), "assets/fonts", file)),
    })),
  ).catch((error: unknown) => {
    // A failed read must not poison every later card.
    fonts = undefined;
    throw error;
  });
  return fonts;
}

type OgFont = {
  name: string;
  weight: (typeof fontFiles)[number]["weight"];
  style: "normal";
  data: Buffer;
};

let fonts: Promise<OgFont[]> | undefined;

/** The wordmark's mark, inlined: Satori fetches nothing. */
export async function ogMark() {
  const bytes = await readFile(join(process.cwd(), "app/icon.png"));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function RoleBadge({ role }: { role: "agent" | "human" }) {
  const agent = role === "agent";
  return (
    <div
      style={{
        display: "flex",
        backgroundColor: agent ? skySoft : peachSoft,
        color: agent ? skyInk : peachInk,
        borderRadius: 999,
        padding: "1px 9px",
        fontSize: 17,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {role}
    </div>
  );
}

/**
 * A message body, with its inline code still in mono.
 *
 * The transcript renders Markdown; the only Markdown these samples use is a
 * backtick, so splitting on it is the whole parser. Odd segments are code.
 *
 * Satori wraps between flex items and never inside one, so the body is broken
 * into words rather than into sentences: a segment kept whole would take the
 * full stop that follows a chip down to the next line with it. Each word
 * carries its own trailing space, which costs nothing at the end of a line,
 * and the spaces that touch a chip are re-spent as margin so the chip sits
 * tight against the punctuation after it, the way the page sets it.
 */
type Token = {
  code: boolean;
  text: string;
  padLeft: boolean;
  padRight: boolean;
};

function tokenize(text: string): Token[] {
  const parts = text.split("`");
  const tokens: Token[] = [];

  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      tokens.push({
        code: true,
        text: part,
        padLeft: parts[i - 1]?.endsWith(" ") ?? false,
        padRight: parts[i + 1]?.startsWith(" ") ?? false,
      });
      return;
    }
    // The spaces either side of a chip became its margin; drop them here.
    const trimmed = part
      .replace(i === 0 ? /$^/ : /^ /, "")
      .replace(i === parts.length - 1 ? /$^/ : / $/, "");
    for (const word of trimmed.split(/(?<= )/)) {
      if (word !== "")
        tokens.push({
          code: false,
          text: word,
          padLeft: false,
          padRight: false,
        });
    }
  });

  return tokens;
}

function Body({ text }: { text: string }) {
  const space = 5;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        width: BODY_WIDTH,
        fontSize: 18,
        lineHeight: 1.45,
        color: ink,
      }}
    >
      {tokenize(text).map((token, i) =>
        token.code ? (
          <span
            key={i}
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 15,
              backgroundColor: panel2,
              border: `1px solid ${line2}`,
              borderRadius: 5,
              padding: "0px 4px",
              marginLeft: token.padLeft ? space : 0,
              marginRight: token.padRight ? space : 0,
              color: ink,
            }}
          >
            {token.text}
          </span>
        ) : (
          <span key={i} style={{ whiteSpace: "pre" }}>
            {token.text}
          </span>
        ),
      )}
    </div>
  );
}

function Message({
  item,
  color,
}: {
  item: Extract<TranscriptItem, { type: "message" }>;
  color: { fill: string; ink: string };
}) {
  return (
    <div style={{ display: "flex", gap: TILE_GAP }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: TILE,
          height: TILE,
          flexShrink: 0,
          borderRadius: 10,
          backgroundColor: color.fill,
          color: color.ink,
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {item.from.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 19,
          }}
        >
          <span style={{ fontWeight: 600, color: ink }}>{item.from.name}</span>
          <RoleBadge role={item.from.role} />
          <span style={{ color: ink3, fontSize: 17 }}>{item.time}</span>
        </div>
        <Body text={item.text} />
      </div>
    </div>
  );
}

export type OgCardProps = {
  mark: string;
  heading: { regular: string; bold: string };
  channel: string;
  chat: TranscriptItem[];
  room: Participant[];
};

/**
 * The frame every card shares: ground, wordmark, the paired headline, and a
 * white panel pinned to the bottom margin. What goes in the panel is the
 * card's own business.
 */
function OgFrame({
  mark,
  heading,
  children,
}: {
  mark: string;
  heading: { regular: string; bold: string };
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: ground,
        fontFamily: "Albert Sans",
      }}
    >
      {/* The square-safe column. Everything that has to survive a 1:1 crop is in it. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: SAFE_WIDTH,
          height: "100%",
          paddingTop: GUTTER,
          paddingBottom: GUTTER,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={34} height={34} alt="" />
          <span
            style={{
              fontFamily: "Funnel Display",
              fontWeight: 700,
              fontSize: 27,
              letterSpacing: "-0.02em",
              color: ink,
            }}
          >
            Wave
          </span>
        </div>

        {/* The landing headline's pairing: one line regular, the next extra bold. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 26,
            fontFamily: "Funnel Display",
            fontSize: HEADING_SIZE,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            color: ink,
          }}
        >
          <span style={{ fontWeight: 400 }}>{heading.regular}</span>
          <span style={{ fontWeight: 800 }}>{heading.bold}</span>
        </div>

        {/*
          The panel. `flexGrow` pins its foot to the bottom margin whatever the
          headline wrapped to, and `overflow` means a long one shortens what is
          in it rather than pushing it off the card.
        */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 17,
            marginTop: 28,
            flexGrow: 1,
            minHeight: 0,
            overflow: "hidden",
            padding: 24,
            borderRadius: 28,
            backgroundColor: panel,
            border: `1px solid ${panelBorder}`,
            boxShadow: shadowSoft,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function OgCard({ mark, heading, channel, chat, room }: OgCardProps) {
  const colorFor = identityPalette(room);
  // Three is what fits, and three is the whole loop: one agent asks, the other
  // answers, the human overrules them. Two would only show a room.
  // A heading that wrapped to three lines has taken a message's worth of the
  // panel with it, so the room shows one fewer rather than clipping the last.
  const shown = chat
    .filter((item) => item.type === "message")
    .slice(0, headingLines(heading) > 2 ? 2 : 3);
  const clients = room
    .filter((participant) => participant.role === "agent")
    .map((participant) => participant.client);

  return (
    <OgFrame mark={mark} heading={heading}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 19,
          color: ink2,
        }}
      >
        <span>
          <span style={{ fontWeight: 600, color: ink }}>{channel}</span>
          {"\u00A0· standard · example"}
        </span>
        <span style={{ color: ink3 }}>{clients.join(" · ")}</span>
      </div>
      {shown.map((item, i) => (
        <Message
          key={i}
          item={item}
          color={colorFor(item.from.name, item.from.role)}
        />
      ))}
    </OgFrame>
  );
}

export type OgNoticeCardProps = {
  mark: string;
  heading: { regular: string; bold: string };
  lines: string[];
};

/**
 * The card for a page with no room to show: a channel link, fetched by a link
 * expander that holds no invite (lib/channel-card.ts).
 *
 * The panel keeps the transcript's rows, tile then text, so the card is
 * recognisably the same object as the others in a feed. The tiles carry
 * numbers in the neutral tone rather than initials in a role's colour, since
 * these are steps, not speakers, and sky and peach mean agent and human.
 */
export function OgNoticeCard({ mark, heading, lines }: OgNoticeCardProps) {
  return (
    <OgFrame mark={mark} heading={heading}>
      {/*
        Three lines do not fill a panel drawn for three messages, so they are
        spread through its height rather than stacked at the top of a blank.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "space-around",
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: TILE_GAP }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: TILE,
                height: TILE,
                flexShrink: 0,
                borderRadius: 10,
                backgroundColor: panel2,
                border: `1px solid ${line2}`,
                color: ink2,
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                display: "flex",
                width: BODY_WIDTH,
                fontSize: 21,
                lineHeight: 1.4,
                color: ink,
              }}
            >
              {line}
            </div>
          </div>
        ))}
      </div>
    </OgFrame>
  );
}

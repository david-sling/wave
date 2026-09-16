import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { identityColor } from "@/lib/identity-color";
import { MessageBody, type MentionTarget } from "./message-body";

/**
 * What comes out of the one component another agent's text reaches a browser
 * through. Asserted as HTML rather than reasoned about: the mention highlight
 * is a remark plugin rewriting the Markdown tree, and the thing worth proving
 * is that it rewrites nothing it was not asked to.
 */

const room: MentionTarget[] = [
  { name: "David", colour: identityColor("David", "human") },
  { name: "Windows agent", colour: identityColor("Windows agent", "agent") },
];

function render(text: string, mentions: MentionTarget[] = room): string {
  return renderToStaticMarkup(<MessageBody text={text} mentions={mentions} />);
}

/** The highlight, whatever colour it came out. */
const MENTION = /<span class="rounded-\[5px\][^"]*"[^>]*>([^<]*)<\/span>/g;

function highlighted(html: string): string[] {
  return [...html.matchAll(MENTION)].map((match) => match[1]);
}

describe("mentions", () => {
  it("highlights a name from the room, in that person's colour", () => {
    const html = render("morning @David");
    expect(highlighted(html)).toEqual(["@David"]);
    expect(html).toContain("background-color:hsl(");
  });

  it("keeps the spelling the sender used", () => {
    expect(highlighted(render("@david, @DAVID"))).toEqual(["@david", "@DAVID"]);
  });

  it("leaves a name nobody has as plain text", () => {
    const html = render("@Nobody is here");
    expect(highlighted(html)).toEqual([]);
    expect(html).toContain("@Nobody is here");
  });

  it("leaves every name alone when the surface has no roster", () => {
    expect(highlighted(render("@David", []))).toEqual([]);
  });

  it("does not touch a name inside inline code", () => {
    const html = render("run `curl @David` now");
    expect(highlighted(html)).toEqual([]);
    expect(html).toContain("curl @David");
  });

  it("does not touch a name inside a fenced block", () => {
    const html = render("```\nssh @David\n```");
    expect(highlighted(html)).toEqual([]);
    expect(html).toContain("<pre");
  });

  it("highlights inside the Markdown it finds the name in", () => {
    const bold = render("**ask @David**");
    expect(bold).toContain("<strong>");
    expect(highlighted(bold)).toEqual(["@David"]);

    const item = render("- @Windows agent to confirm");
    expect(item).toContain("<li");
    expect(highlighted(item)).toEqual(["@Windows agent"]);
  });

  it("still renders the Markdown around a mention", () => {
    const html = render("# Status\n\n@David: `ok`\n\n- one\n- two");
    expect(html).toContain("Status");
    expect(html).toContain("<code");
    expect(html).toContain("<ul");
    expect(highlighted(html)).toEqual(["@David"]);
  });

  it("renders no HTML from the message, mention or not", () => {
    const html = render('<img src=x onerror=alert(1)> @David <b>hi</b>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>hi");
    expect(highlighted(html)).toEqual(["@David"]);
  });
});

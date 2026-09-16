import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JumpToSeq, ReplyAction, ReplyProvider } from "./reply-action";

/**
 * The property this component exists for: it is inert outside a provider.
 *
 * That is what lets `transcript.tsx` stay a server component and keeps six
 * marketing pages from shipping a transcript bundle for a button they have
 * nowhere to use. A default context value would quietly undo it, so the
 * absence is asserted rather than assumed.
 */
describe("ReplyAction", () => {
  it("renders nothing with no composer to reply into", () => {
    expect(renderToStaticMarkup(<ReplyAction seq={7} author="Windows agent" />)).toBe("");
  });

  it("renders nothing for an item with no seq, which is every illustrative transcript", () => {
    const html = renderToStaticMarkup(
      <ReplyProvider onReply={() => {}}>
        <ReplyAction author="Maya's agent" />
      </ReplyProvider>,
    );
    expect(html).toBe("");
  });

  it("names the author it would answer, since the icon alone says nothing about who", () => {
    const html = renderToStaticMarkup(
      <ReplyProvider onReply={() => {}}>
        <ReplyAction seq={7} author="Windows agent" />
      </ReplyProvider>,
    );
    // A column of identical arrows, so the name has to be in the accessible
    // name and in the tooltip rather than on screen.
    expect(html).toContain('aria-label="Reply to Windows agent"');
    expect(html).toContain('title="Reply to Windows agent"');
    expect(html).toContain("<svg");
  });
});

describe("JumpToSeq", () => {
  it("says where it goes, since the quote it wraps is already cut short", () => {
    const html = renderToStaticMarkup(
      <JumpToSeq seq={7} label="Replying to Windows agent. Go to it.">
        <span>Build passes.</span>
      </JumpToSeq>,
    );
    expect(html).toContain('aria-label="Replying to Windows agent. Go to it."');
    expect(html).toContain("Build passes.");
  });
});

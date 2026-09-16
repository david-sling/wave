import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplyAction, ReplyProvider } from "./reply-action";

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

  it("names the author it would answer, so the control is not six identical buttons", () => {
    const html = renderToStaticMarkup(
      <ReplyProvider onReply={() => {}}>
        <ReplyAction seq={7} author="Windows agent" />
      </ReplyProvider>,
    );
    expect(html).toContain("Reply");
    expect(html).toContain("to Windows agent");
  });
});

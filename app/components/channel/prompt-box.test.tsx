import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptBox } from "./prompt-box";

/**
 * Which of the two prompts a channel offers.
 *
 * Rendered rather than reasoned about, because the rule is a default and an
 * exception: curl stays the default until the CLI passes the gate in PRODUCT
 * section 16, and an encrypted channel offers only the CLI, since the key has
 * to live in a process rather than in a shell.
 */

const props = {
  host: "https://wave.example.com",
  channelId: "ZmFrZS1jaGFubmVsLWlk",
  channelName: "Release 4.2",
  invite: "EPMbHaa_zgNMoLNWhmLWuQyEja16cWPAwH1HuugRUTE",
};

describe("PromptBox", () => {
  it("offers both spellings, with curl chosen", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} />);

    expect(html).toContain("wave CLI");
    expect(html).toContain('checked="" value="curl"');
    // The curl prompt, which is the one with a BASE line in it.
    expect(html).toContain("BASE=https://wave.example.com/api/v1/channels/");
    expect(html).not.toContain("npm i -g");
  });

  it("offers an encrypted channel the CLI alone, and no toggle to get it wrong with", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} mode="e2ee" />);

    expect(html).toContain("npm i -g @david-sling/wave");
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("never reaches a shell");
  });

  it("says what each choice costs, since that is the whole difference", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} />);

    expect(html).toContain("Nothing to install");
  });
});

describe("two prompt boxes on one page", () => {
  it("give their radios different group names", () => {
    // The empty channel's box and the dialog's are both mounted at once, and
    // radios outside a form share one group per name: a fixed name would make
    // choosing in one box unchoose the other.
    const html = renderToStaticMarkup(
      <>
        <PromptBox {...props} />
        <PromptBox {...props} />
      </>,
    );
    const names = new Set([...html.matchAll(/name="(prompt-variant[^"]*)"/g)].map((match) => match[1]));

    expect(names.size).toBe(2);
  });
});

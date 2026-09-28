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

    expect(html).toContain(">npm<");
    expect(html).not.toContain("wave CLI");
    expect(html).toContain('checked="" value="curl"');
    // The curl prompt, which is the one with a BASE line in it.
    expect(html).toContain("BASE=https://wave.example.com/api/v1/channels/");
    // The prompt itself is the curl one; the npm note is laid out but hidden.
    expect(html).not.toContain("wave join");
  });

  it("offers an encrypted channel the CLI alone, and no toggle to get it wrong with", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} mode="e2ee" />);

    expect(html).toContain("npm i -g @david-sling/wave");
    expect(html).not.toContain('value="cli"');
    expect(html).toContain("never reaches a shell");
  });

  it("says what each choice costs, since that is the whole difference", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} />);

    expect(html).toContain("Nothing to install");
  });
});

describe("the method choice", () => {
  it("offers curl and the four package managers, curl chosen", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} />);
    const offered = [...html.matchAll(/name="prompt-variant[^"]*"(?: checked="")? value="([^"]+)"/g)].map((match) => match[1]);

    expect(offered).toEqual(["curl", "npm", "pnpm", "yarn", "bun"]);
    expect(html).toContain('checked="" value="curl"');
  });

  it("lays out every package manager's install for the person to run, hidden until chosen", () => {
    // Laid out rather than mounted on choice, so switching does not resize the dialog.
    const html = renderToStaticMarkup(<PromptBox {...props} />);

    for (const command of [
      "npm i -g @david-sling/wave",
      "pnpm add -g @david-sling/wave",
      "yarn global add @david-sling/wave",
      "bun add -g @david-sling/wave",
    ]) {
      expect(html).toContain(command);
    }
    expect(html).toContain('aria-label="Copy the install command"');
  });

  it("offers an encrypted channel the package managers without curl, npm chosen", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} mode="e2ee" />);

    expect(html).not.toContain('value="curl"');
    expect(html).toContain('checked="" value="npm"');
    expect(html).toContain("npm i -g @david-sling/wave");
  });
});

describe("the agent choice", () => {
  it("offers any agent, chosen, and Claude Code", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} />);

    expect(html).toContain('checked="" value="any"');
    expect(html).toContain("Any agent");
    expect(html).toContain("Claude Code");
  });

  it("is offered on an encrypted channel too, where the method is not a choice", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} mode="e2ee" />);

    expect(html).toContain('value="claude-code"');
    expect(html).not.toContain('value="curl"');
  });

  it("names each agent for assistive tech and in a tooltip, since the option itself is a mark", () => {
    const html = renderToStaticMarkup(<PromptBox {...props} />);

    expect(html).toContain('aria-label="Any agent"');
    expect(html).toContain('aria-label="Claude Code"');
    expect(html).toContain('class="choice-tip"');
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
    for (const group of ["prompt-variant", "prompt-provider"]) {
      const names = new Set([...html.matchAll(new RegExp(`name="(${group}[^"]*)"`, "g"))].map((match) => match[1]));
      expect(names.size, group).toBe(2);
    }
  });
});

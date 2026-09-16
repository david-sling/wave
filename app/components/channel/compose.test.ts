import { describe, expect, it } from "vitest";
import type { Participant } from "../transcript";
import { suggest, tokenAt } from "./compose";

/** The composer's `@` menu, without the composer: what it offers and when. */

const room: Participant[] = [
  { name: "David", role: "human", client: "", presence: "active" },
  { name: "Windows agent", role: "agent", client: "codex-cli", presence: "idle" },
  { name: "Linda's agent", role: "agent", client: "claude-code", presence: "gone" },
];

describe("tokenAt", () => {
  it("finds the mention the caret is in", () => {
    expect(tokenAt("ping @Dav", 9)).toEqual({ at: 5, query: "Dav" });
  });

  it("opens on a bare @", () => {
    expect(tokenAt("@", 1)).toEqual({ at: 0, query: "" });
  });

  it("reads a name with a space in it as one query", () => {
    expect(tokenAt("@Windows ag", 11)).toEqual({ at: 0, query: "Windows ag" });
  });

  it("finds nothing where there is no @ behind the caret", () => {
    expect(tokenAt("ping David", 10)).toBeNull();
  });

  it("does not open inside an email address", () => {
    expect(tokenAt("david@example", 13)).toBeNull();
  });

  it("stops at a newline, so an @ a paragraph up cannot hold the menu open", () => {
    expect(tokenAt("@David\nthanks", 13)).toBeNull();
  });

  it("gives up once what was typed is too long to be a name", () => {
    expect(tokenAt(`@${"x".repeat(80)}`, 81)).toBeNull();
  });
});

describe("suggest", () => {
  it("offers the whole room for a bare @", () => {
    expect(suggest(room, "").map((p) => p.name)).toEqual(["David", "Windows agent", "Linda's agent"]);
  });

  it("puts a name that starts with the query ahead of one that merely contains it", () => {
    expect(suggest(room, "lind").map((p) => p.name)).toEqual(["Linda's agent"]);
    expect(suggest(room, "agent").map((p) => p.name)).toEqual(["Windows agent", "Linda's agent"]);
  });

  it("ignores case", () => {
    expect(suggest(room, "WINDOWS").map((p) => p.name)).toEqual(["Windows agent"]);
  });

  it("offers someone who has gone, because naming them is a thing people mean to do", () => {
    expect(suggest(room, "linda")[0].presence).toBe("gone");
  });

  it("offers nobody when the query matches nobody", () => {
    expect(suggest(room, "zz")).toEqual([]);
  });
});

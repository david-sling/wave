"use client";

import { toJson, toMarkdown, transcriptFilename } from "@/lib/transcript-export";
import type { ChannelMeta, Item, RosterEntry } from "./use-channel";

/**
 * Take the conversation with you before the channel expires (PRODUCT 10).
 *
 * The file is built from what this browser already has and handed straight to
 * the download, so nothing is uploaded and no request is made. That is the
 * only way it can work in `e2ee` mode, where the server holds ciphertext and
 * could not write this file even if asked.
 */
export function ExportTranscript({
  channel,
  items,
  participants,
}: {
  channel: ChannelMeta;
  items: Item[];
  participants: RosterEntry[];
}) {
  const empty = items.length === 0;

  function download(format: "json" | "md") {
    const exportedAt = new Date().toISOString();
    const source = { channel, items, participants, exportedAt };
    const body = format === "json" ? toJson(source) : toMarkdown(source);
    const url = URL.createObjectURL(
      new Blob([body], { type: format === "json" ? "application/json" : "text/markdown" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = transcriptFilename(channel, format, exportedAt);
    link.click();
    // Revoked on the next frame: Safari has not finished reading the blob when
    // click() returns, and a revoked URL there downloads an empty file.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }

  return (
    <div className="grid gap-2 border-t border-line pt-3">
      <span className="text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">Export</span>
      <p className="m-0 text-[13px] text-ink-2">
        {empty
          ? "Nothing has been said yet. Once the conversation starts you can take a copy."
          : "Saves the conversation to your device. The channel is deleted when it expires."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-secondary flex-1"
          disabled={empty}
          onClick={() => download("md")}
        >
          Markdown
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary flex-1"
          disabled={empty}
          onClick={() => download("json")}
        >
          JSON
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./copy-button";
import { ExportTranscript } from "./export-transcript";
import type { ChannelMeta, Item, RosterEntry } from "./use-channel";

/** Counts down to expiry, in the coarsest unit that is still honest. */
function remaining(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  if (seconds === 0) return "expired";
  if (seconds < 60) return `${seconds}s left`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
}

export function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="whitespace-nowrap text-[13px] text-ink-3" title={new Date(expiresAt).toLocaleString()}>
      {remaining(expiresAt, now)}
    </span>
  );
}

/**
 * Share and close. Closing is the creator's alone: the button only appears in
 * the browser that holds the admin token, and it deletes everything at once.
 */
export function Controls({
  shareUrl,
  canClose,
  onClose,
  transcript,
}: {
  shareUrl: string;
  canClose: boolean;
  onClose: () => Promise<void>;
  /** Everything the export needs. Passed down rather than re-read: the page already has it. */
  transcript: { channel: ChannelMeta; items: Item[]; participants: RosterEntry[] };
}) {
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <span className="text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">Share</span>
        <p className="m-0 text-[13px] text-ink-2">
          Anyone with this link can join and read the channel. It carries the invite, so treat it like a key.
        </p>
        <CopyButton value={shareUrl} label="Copy channel link" variant="secondary" />
      </div>

      <ExportTranscript {...transcript} />

      {canClose ? (
        <div className="grid gap-2 border-t border-line pt-3">
          <span className="text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">Close</span>
          {confirming ? (
            <>
              <p className="m-0 text-[13px] text-ink-2">
                This deletes every message and key in the channel now. It cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-danger-filled"
                  onClick={async () => {
                    try {
                      await onClose();
                    } catch (error) {
                      setFailure(error instanceof Error ? error.message : "The channel did not close.");
                    }
                  }}
                >
                  Close and delete
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-[13px] text-ink-2">Deletes everything immediately, for everyone.</p>
              <button type="button" className="btn btn-sm btn-danger w-full" onClick={() => setConfirming(true)}>
                Close channel
              </button>
            </>
          )}
          {failure ? (
            <p role="status" className="error-note m-0 text-sm">
              {failure}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

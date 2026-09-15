"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The channel page's connection to its channel (ARCHITECTURE section 6).
 *
 * It polls the same long-poll endpoint the agents use. The invite comes from
 * the URL fragment, so it never reaches the server in a page request, and the
 * admin token is read from this browser's storage and sent only on close.
 */

export type Role = "agent" | "human";
export type Presence = "active" | "idle" | "gone";

export type Item =
  | {
      seq: number;
      ts: string;
      type: "message";
      from: { id: string; name: string; role: Role };
      text: string;
      kind: "message" | "done";
      reply_to?: number;
    }
  | {
      seq: number;
      ts: string;
      type: "system";
      event: string;
      /** The event as a sentence, written by the server (lib/events.ts). */
      text?: string;
      subject?: { id: string; name: string; role: Role };
    };

export type RosterEntry = {
  id: string;
  name: string;
  role: Role;
  presence: Presence;
  client?: string;
  /**
   * How far down the channel this participant's client has taken delivery.
   * Present only because this page asks for receipts; absent for anyone who
   * has not polled yet.
   */
  read_seq?: number;
};

export type ChannelMeta = {
  id: string;
  name: string;
  mode: string;
  created_at: string;
  expires_at: string;
  max_participants: number;
};

export type ChannelStatus = "loading" | "ready" | "gone" | "no-invite" | "error";

export type Me = { id: string; token: string; name: string };

/**
 * Something you have said that the channel has not handed back yet.
 *
 * A message posts, then arrives on the next poll, and between the two there is
 * a round trip. Without this the text would vanish from the composer and
 * reappear in the transcript a moment later, which reads as a message that got
 * lost. So it is drawn straight away, dimmed, and the dimming lifts when the
 * real item arrives in its place.
 */
export type PendingMessage = {
  /** Local id, and the `client_id` the server dedupes retries on. */
  id: string;
  text: string;
  name: string;
  ts: string;
  /** Set once the post is accepted. It is still pending until the poll delivers it. */
  seq?: number;
};

/**
 * Long-poll seconds, the server's cap and the same hold the agents use. The
 * first read asks for none of them: history should not be waited for. Holding
 * one request costs almost nothing; starting a new one pays for the
 * authentication, the presence write and the roster read again.
 */
const POLL_WAIT = 50;

/**
 * How often a hidden tab checks in. A participant silent for ten minutes is
 * announced as timed out, and someone whose tab is in the background has not
 * left, so this stays well inside that.
 */
const HIDDEN_HEARTBEAT_MS = 4 * 60_000;

/** How a poll ended. Only a page that actually read the channel counts as having loaded it. */
type PollResult = "ok" | "retry" | "gone";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Drops the pending messages a poll has now delivered.
 *
 * By seq where the post came back in time to record one, and otherwise by
 * matching text from this participant — a poll already in flight can carry the
 * message back before its own POST has answered. Matches are consumed one for
 * one, so saying the same thing twice does not retire both copies at once.
 */
export function reconcile(
  queue: PendingMessage[],
  items: Item[],
  lastSeq: number,
  mine: string | undefined,
): PendingMessage[] {
  const arrived = new Map<string, number>();
  for (const item of items) {
    if (item.type === "message" && item.from.id === mine) arrived.set(item.text, (arrived.get(item.text) ?? 0) + 1);
  }

  return queue.filter((entry) => {
    const waiting = arrived.get(entry.text) ?? 0;
    const delivered = (entry.seq !== undefined && entry.seq <= lastSeq) || waiting > 0;
    if (waiting > 0) arrived.set(entry.text, waiting - 1);
    return !delivered;
  });
}

const participantKey = (channelId: string) => `wave.participant.${channelId}`;
export const adminKey = (channelId: string) => `wave.admin.${channelId}`;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing. The channel still works for this tab.
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export function useChannel(channelId: string) {
  const [status, setStatus] = useState<ChannelStatus>("loading");
  const [channel, setChannel] = useState<ChannelMeta | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [participants, setParticipants] = useState<RosterEntry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  /** Where the channel already was when this page opened: everything up to here is history. */
  const [historyUpTo, setHistoryUpTo] = useState<number | null>(null);
  /** The head of the channel, which is what a read receipt is measured against. */
  const [lastSeq, setLastSeq] = useState(0);

  const invite = useRef<string | null>(null);
  const cursor = useRef(0);
  const meRef = useRef<Me | null>(null);
  /** The join in flight, so two quick messages do not join this browser twice. */
  const joining = useRef<Promise<Me> | null>(null);
  /** The post in flight, so two quick messages keep the order they were typed in. */
  const posting = useRef<Promise<unknown>>(Promise.resolve());

  const token = useCallback(() => meRef.current?.token ?? invite.current ?? "", []);

  /** Joins as a human on first post, under the name they chose (PRODUCT 6.2). */
  const join = useCallback(
    async (name: string): Promise<Me> => {
      joining.current ??= (async () => {
        const response = await fetch(`/api/v1/channels/${channelId}/join`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${invite.current}` },
          body: JSON.stringify({ name, role: "human", client: "wave-web" }),
        });
        if (!response.ok) throw new Error(await readError(response));

        const joined = await response.json();
        const identity: Me = { id: joined.participant_id, token: joined.participant_token, name: joined.name };
        meRef.current = identity;
        setMe(identity);
        writeStorage(participantKey(channelId), JSON.stringify(identity));
        return identity;
      })();

      try {
        return await joining.current;
      } catch (failure) {
        // A failed join must not poison the next attempt.
        joining.current = null;
        throw failure;
      }
    },
    [channelId],
  );

  /**
   * Says something, and shows it immediately.
   *
   * The draft goes into the transcript before the request leaves, and stays
   * there — dimmed — until the poll brings back the real item to replace it.
   * Nothing is removed on the way through, so the message never blinks out of
   * existence between being sent and arriving. A post that fails takes its
   * draft with it and throws, and the composer hands the text back.
   *
   * Posts queue behind one another. Nothing stops you typing the next message
   * while one is in flight, but two sent a moment apart must not race each
   * other into the transcript backwards. A failed post does not hold up the
   * one behind it.
   */
  const post = useCallback(
    async (text: string, name: string): Promise<void> => {
      const id = newId();
      setPending((queue) => [
        ...queue,
        { id, text, name: meRef.current?.name ?? name.trim(), ts: new Date().toISOString() },
      ]);

      const ahead = posting.current;
      const attempt = (async () => {
        await ahead.catch(() => {});
        const identity = meRef.current ?? (await join(name));
        const response = await fetch(`/api/v1/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${identity.token}` },
          body: JSON.stringify({ text, client_id: id }),
        });
        if (!response.ok) throw new Error(await readError(response));

        const accepted = await response.json();
        setPending((queue) =>
          queue.map((entry) => (entry.id === id ? { ...entry, seq: accepted.seq, name: identity.name } : entry)),
        );
      })();
      posting.current = attempt;

      try {
        await attempt;
      } catch (failure) {
        setPending((queue) => queue.filter((entry) => entry.id !== id));
        throw failure;
      }
    },
    [channelId, join],
  );

  const closeChannel = useCallback(async (): Promise<void> => {
    const admin = readStorage(adminKey(channelId));
    if (!admin) throw new Error("The admin token for this channel is not in this browser.");

    const response = await fetch(`/api/v1/channels/${channelId}/close`, {
      method: "POST",
      headers: { authorization: `Bearer ${admin}` },
    });
    if (!response.ok) throw new Error(await readError(response));
    setStatus("gone");
  }, [channelId]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    /** Reads what this browser knows: the invite from the fragment, the identity from storage. */
    function recall(): boolean {
      invite.current = window.location.hash.replace(/^#/, "") || null;
      if (!invite.current) {
        setStatus("no-invite");
        return false;
      }
      setInviteToken(invite.current);

      const stored = readStorage(participantKey(channelId));
      if (stored) {
        try {
          const identity = JSON.parse(stored) as Me;
          meRef.current = identity;
          setMe(identity);
        } catch {
          // Unreadable. They will be asked for a name again on their first post.
        }
      }
      return true;
    }

    async function bootstrap(): Promise<boolean> {
      const response = await fetch(`/api/v1/channels/${channelId}`, {
        headers: { authorization: `Bearer ${invite.current}` },
        signal: controller.signal,
      });
      if (response.status === 410) {
        setStatus("gone");
        return false;
      }
      if (!response.ok) {
        setError(await readError(response));
        setStatus("error");
        return false;
      }
      const view = await response.json();
      setChannel(view.channel);
      setParticipants(view.participants);
      setHistoryUpTo(view.last_seq);
      setLastSeq(view.last_seq);
      return true;
    }

    /** One poll. `wait` of zero reads what is there and returns without holding. */
    async function pollOnce(wait: number): Promise<PollResult> {
      // receipts=1 is the page asking for everyone's cursor. The agents are not
      // given it unless they ask for it too, and are not told it exists: a
      // number saying a peer has not read something is a thing a person can
      // use and a thing an agent would act on (docs/IDEAS.md, read receipts).
      const response = await fetch(
        `/api/v1/channels/${channelId}/messages?after=${cursor.current}&wait=${wait}&receipts=1`,
        { headers: { authorization: `Bearer ${token()}` }, signal: controller.signal },
      );
      if (response.status === 410) {
        setStatus("gone");
        return "gone";
      }
      if (response.status === 429) {
        // Two polls already open, probably another tab. Back off and try again.
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        return "retry";
      }
      if (!response.ok) throw new Error(await readError(response));

      const page = await response.json();
      if (page.items.length > 0) {
        setItems((existing) => [...existing, ...page.items]);
        cursor.current = page.last_seq;
      }
      // In the same pass as the items above, so a message hands over to its own
      // draft within one render rather than flickering between the two.
      setPending((queue) => reconcile(queue, page.items, page.last_seq, meRef.current?.id));
      setParticipants(page.participants);
      setLastSeq(page.last_seq);
      setError(null);
      return "ok";
    }

    /** Waits until the tab is shown again, or `ms` passes, or the page goes away. */
    function whileHidden(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          document.removeEventListener("visibilitychange", onShown);
          controller.signal.removeEventListener("abort", finish);
          resolve();
        };
        const onShown = () => {
          if (document.visibilityState === "visible") finish();
        };
        const timer = setTimeout(finish, ms);
        document.addEventListener("visibilitychange", onShown);
        controller.signal.addEventListener("abort", finish, { once: true });
      });
    }

    void (async () => {
      if (!recall()) return;
      if (!(await bootstrap().catch(() => false))) return;

      // The channel is not ready when its metadata lands, it is ready when its
      // transcript does. Opening on an empty room that fills in a moment later
      // reads as a channel that lost its history, so the first read is an
      // immediate one and the page waits for it.
      let loaded = false;
      const loadedNow = () => {
        loaded = true;
        // Never over the top of an ending: a closed channel stays closed.
        setStatus((current) => (current === "loading" ? "ready" : current));
      };

      while (!stopped) {
        try {
          // Between polls, never mid-poll: a tab hidden while one is in flight
          // lets it finish. The poll it starts on return is the catch-up read.
          if (loaded && document.visibilityState === "hidden") {
            // Presence only, and only for someone who has spoken: a reader who
            // never posted is not in the roster and has nothing to keep alive.
            if (meRef.current) {
              const beat = await pollOnce(0).catch((): PollResult => "retry");
              if (beat === "gone") return;
            }
            await whileHidden(HIDDEN_HEARTBEAT_MS);
            continue;
          }

          const result = await pollOnce(loaded ? POLL_WAIT : 0);
          if (result === "gone") return;
          if (result === "ok") loadedNow();
        } catch (failure) {
          if (controller.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : "Lost the connection.");
          // Show the channel with its error rather than leaving it opening forever.
          loadedNow();
          // Wait before trying again, so a broken channel is not hammered.
          await new Promise((resolve) => setTimeout(resolve, 3_000));
        }
      }
    })();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [channelId, token]);

  return {
    status,
    channel,
    items,
    pending,
    participants,
    me,
    error,
    invite: inviteToken,
    historyUpTo,
    lastSeq,
    post,
    closeChannel,
  };
}

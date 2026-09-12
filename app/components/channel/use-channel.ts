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
      subject?: { id: string; name: string; role: Role };
    };

export type RosterEntry = { id: string; name: string; role: Role; presence: Presence };

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
  const [participants, setParticipants] = useState<RosterEntry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  /** Where the channel already was when this page opened: everything up to here is history. */
  const [historyUpTo, setHistoryUpTo] = useState<number | null>(null);

  const invite = useRef<string | null>(null);
  const cursor = useRef(0);
  const meRef = useRef<Me | null>(null);

  const token = useCallback(() => meRef.current?.token ?? invite.current ?? "", []);

  /** Joins as a human on first post, under the name they chose (PRODUCT 6.2). */
  const join = useCallback(
    async (name: string): Promise<Me> => {
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
    },
    [channelId],
  );

  const post = useCallback(
    async (text: string, name: string): Promise<void> => {
      const identity = meRef.current ?? (await join(name));
      const response = await fetch(`/api/v1/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${identity.token}` },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(await readError(response));
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
      setStatus("ready");
      return true;
    }

    /** One long-poll. Returns false when the channel is over. */
    async function pollOnce(): Promise<boolean> {
      const response = await fetch(
        `/api/v1/channels/${channelId}/messages?after=${cursor.current}&wait=25`,
        { headers: { authorization: `Bearer ${token()}` }, signal: controller.signal },
      );
      if (response.status === 410) {
        setStatus("gone");
        return false;
      }
      if (response.status === 429) {
        // Two polls already open, probably another tab. Back off and try again.
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        return true;
      }
      if (!response.ok) throw new Error(await readError(response));

      const page = await response.json();
      if (page.items.length > 0) {
        setItems((existing) => [...existing, ...page.items]);
        cursor.current = page.last_seq;
      }
      setParticipants(page.participants);
      setError(null);
      return true;
    }

    void (async () => {
      if (!recall()) return;
      if (!(await bootstrap().catch(() => false))) return;

      while (!stopped) {
        try {
          if (!(await pollOnce())) return;
        } catch (failure) {
          if (controller.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : "Lost the connection.");
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

  return { status, channel, items, participants, me, error, invite: inviteToken, historyUpTo, post, closeChannel };
}

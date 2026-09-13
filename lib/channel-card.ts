import type { Metadata } from 'next'
import { channelState, type ChannelState } from './channels'
import { getRedis } from './redis'
import { siteOpenGraph } from './site'

/**
 * The channel page as it appears when its link is shared.
 *
 * A channel link is pasted into a chat, and the chat's link expander fetches
 * the page to draw a card. That fetch carries the URL without its fragment, so
 * it holds the channel ID and not the invite, and the card is drawn for
 * whoever is about to click: someone whose agent has been asked into a room.
 *
 * Nothing the invite protects is in it. Not the name, not the roster, not how
 * long is left. The one fact the ID alone gives up is whether the channel is
 * still there, and a link shared after the room has closed is better read as
 * "gone" than as an invitation to nothing.
 */

export type ChannelCard = {
  title: string
  description: string
  heading: { regular: string; bold: string }
  /** The lines in the card's panel, in the place a transcript would go. */
  lines: string[]
}

export const channelCards: Record<ChannelState, ChannelCard> = {
  live: {
    title: 'Your agent is invited · Wave',
    description:
      'Someone opened a Wave channel and sent you the link. Open it to watch the room, and paste its prompt into your coding agent to bring it in. Nothing to install.',
    heading: { regular: 'Your agent is invited', bold: 'to a shared channel.' },
    lines: [
      'Open the link to watch the room.',
      'Paste the prompt into your coding agent.',
      'Watch the agents talk, and steer when you like.',
    ],
  },
  gone: {
    title: 'This channel is gone · Wave',
    description:
      'It expired or was closed, and every message in it was deleted. Nothing is kept after that, so there is nothing to recover.',
    heading: { regular: 'This channel is gone,', bold: 'and nothing was kept.' },
    lines: [
      'It expired or was closed.',
      'Every message in it was deleted.',
      'A new channel takes one click from the home page.',
    ],
  },
}

/**
 * The state the card is drawn for.
 *
 * Never throws: a card is not worth failing a page over. With the store
 * unreachable, or an instance whose configuration cannot say where it is,
 * the link is treated as what it almost always is, an invitation.
 */
export async function cardState(channelId: string): Promise<ChannelState> {
  try {
    return await channelState(await getRedis(), channelId)
  } catch {
    return 'live'
  }
}

/** The page's metadata. `openGraph` replaces the layout's wholesale, so the site's defaults are spread back in. */
export function channelMetadata(channelId: string, state: ChannelState): Metadata {
  const card = channelCards[state]
  return {
    title: card.title,
    description: card.description,
    // A channel link is a key. Keep it out of search results.
    robots: { index: false, follow: false },
    openGraph: {
      ...siteOpenGraph,
      title: card.title,
      description: card.description,
      // The page's address as far as the server knows it: the invite is in the
      // fragment, which never arrives, and must never be written back out here.
      url: `/c/${channelId}`,
    },
    // No `twitter` block: with an `opengraph-image` beside the page, Next
    // derives the card from the Open Graph fields and asks for the large one.
  }
}

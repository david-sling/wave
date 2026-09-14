import type { Metadata } from 'next'
import { glanceChannel, type ChannelGlance } from './channels'
import { getRedis } from './redis'
import { channelGone, siteName, siteOpenGraph } from './site'

/**
 * The channel page as it appears when its link is shared.
 *
 * A channel link is pasted into a chat, and the chat's link expander fetches
 * the page to draw a card. That fetch carries the URL without its fragment, so
 * it holds the channel ID and not the invite, and the card is drawn for
 * whoever is about to click: someone whose agent has been asked into a room.
 *
 * It is drawn from what the ID alone gives up (lib/channels.ts): whether the
 * channel is still there, and its name, so the card can say which room the
 * link opens. A link shared after the room has closed is better read as
 * "gone" than as an invitation to nothing. The roster and the transcript stay
 * behind the invite, and never appear here.
 */

export type ChannelCard = {
  title: string
  description: string
  heading: { regular: string; bold: string }
  /** The lines in the card's panel, in the place a transcript would go. */
  lines: string[]
}

const inviteDescription =
  'Someone opened a Wave channel and sent you the link. Open it to watch the room, and paste its prompt into your coding agent to bring it in. Nothing to install.'

const inviteLines = [
  'Open the link to watch the room.',
  'Paste the prompt into your coding agent.',
  'Watch the agents talk, and steer when you like.',
]

const goneCard: ChannelCard = channelGone

/**
 * The card for a glance.
 *
 * A named channel puts its name where the page puts it, in the title, and
 * makes it the bold half of the headline. One created without a name is not
 * called "Unnamed channel" here the way the page's bar calls it: the bar has
 * to fill a slot, and a card does not.
 */
export function channelCard(glance: ChannelGlance): ChannelCard {
  if (glance.state === 'gone') return goneCard
  if (glance.name === '') {
    return {
      title: `Your agent is invited · ${siteName}`,
      description: inviteDescription,
      heading: { regular: 'Your agent is invited', bold: 'to a shared channel.' },
      lines: inviteLines,
    }
  }
  return {
    title: `${glance.name} · ${siteName}`,
    description: inviteDescription,
    heading: { regular: 'Your agent is invited to', bold: `${glance.name}.` },
    lines: inviteLines,
  }
}

/**
 * The glance the card is drawn from.
 *
 * Never throws: a card is not worth failing a page over. With the store
 * unreachable, or an instance whose configuration cannot say where it is,
 * the link is treated as what it almost always is, an invitation.
 */
export async function glance(channelId: string): Promise<ChannelGlance> {
  try {
    return await glanceChannel(await getRedis(), channelId)
  } catch {
    return { state: 'live', name: '' }
  }
}

/** The page's metadata. `openGraph` replaces the layout's wholesale, so the site's defaults are spread back in. */
export function channelMetadata(channelId: string, glance: ChannelGlance): Metadata {
  const card = channelCard(glance)
  return {
    title: card.title,
    description: card.description,
    // A channel link is a key. Keep it out of search results. This tag, not
    // robots.txt, is what does it: the bots that draw link cards must be able
    // to fetch the page (app/robots.ts).
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

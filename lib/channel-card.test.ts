import { describe, expect, it } from 'vitest'
import { channelCards, channelMetadata } from './channel-card'
import type { ChannelState } from './channels'

const states: ChannelState[] = ['live', 'gone']

describe('channelMetadata', () => {
  it.each(states)('%s: keeps the page out of search results', (state) => {
    expect(channelMetadata('abc', state).robots).toEqual({ index: false, follow: false })
  })

  it.each(states)('%s: names the site on the card, with the page address and no fragment', (state) => {
    const metadata = channelMetadata('abc', state)
    const openGraph = metadata.openGraph as Record<string, unknown>
    expect(openGraph.siteName).toBe('Wave')
    expect(openGraph.type).toBe('website')
    expect(openGraph.locale).toBe('en_US')
    expect(openGraph.url).toBe('/c/abc')
    expect(JSON.stringify(metadata)).not.toContain('#')
  })

  it.each(states)('%s: says the same thing in the tab and on the card', (state) => {
    const metadata = channelMetadata('abc', state)
    const openGraph = metadata.openGraph as Record<string, unknown>
    expect(metadata.title).toBe(channelCards[state].title)
    expect(openGraph.title).toBe(metadata.title)
    expect(openGraph.description).toBe(metadata.description)
  })

  it('reads as an invitation while the channel is live, and as closed once it is gone', () => {
    expect(channelMetadata('abc', 'live').title).toMatch(/invited/)
    expect(channelMetadata('abc', 'gone').title).toMatch(/gone/)
  })
})

import { describe, expect, it } from 'vitest'
import { channelCard, channelMetadata } from './channel-card'
import type { ChannelGlance } from './channels'

const glances: [string, ChannelGlance][] = [
  ['named', { state: 'live', name: 'Release 4.2' }],
  ['unnamed', { state: 'live', name: '' }],
  ['gone', { state: 'gone' }],
]

describe('channelMetadata', () => {
  it.each(glances)('%s: keeps the page out of search results', (_, glance) => {
    expect(channelMetadata('abc', glance).robots).toEqual({ index: false, follow: false })
  })

  it.each(glances)('%s: names the site on the card, with the page address and no fragment', (_, glance) => {
    const metadata = channelMetadata('abc', glance)
    const openGraph = metadata.openGraph as Record<string, unknown>
    expect(openGraph.siteName).toBe('Wave')
    expect(openGraph.type).toBe('website')
    expect(openGraph.locale).toBe('en_US')
    expect(openGraph.url).toBe('/c/abc')
    expect(JSON.stringify(metadata)).not.toContain('#')
  })

  it.each(glances)('%s: says the same thing in the tab and on the card', (_, glance) => {
    const metadata = channelMetadata('abc', glance)
    const openGraph = metadata.openGraph as Record<string, unknown>
    expect(metadata.title).toBe(channelCard(glance).title)
    expect(openGraph.title).toBe(metadata.title)
    expect(openGraph.description).toBe(metadata.description)
  })
})

describe('channelCard', () => {
  it('puts the channel name in the title and the headline', () => {
    const card = channelCard({ state: 'live', name: 'Release 4.2' })
    expect(card.title).toBe('Release 4.2 · Wave')
    expect(card.heading.bold).toBe('Release 4.2.')
  })

  it('reads as an invitation when the channel has no name', () => {
    const card = channelCard({ state: 'live', name: '' })
    expect(card.title).toMatch(/invited/)
    expect(card.title).not.toMatch(/Unnamed/)
  })

  it('reads as closed once the channel is gone', () => {
    expect(channelCard({ state: 'gone' }).title).toMatch(/gone/)
  })
})

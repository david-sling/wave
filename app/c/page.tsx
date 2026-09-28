import type { Metadata } from 'next'
import { siteName } from '@/lib/site'

export const metadata: Metadata = {
  title: `Channels · ${siteName}`,
  robots: { index: false, follow: false },
}

/** The list alone. The layout draws it; beside it on a computer there is nothing open yet. */
export default function ChannelsPage() {
  return <div aria-hidden className="hidden flex-1 bg-panel lg:block" />
}

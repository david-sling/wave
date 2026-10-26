import type { Metadata } from 'next'
import { publicOrigin } from '@/lib/config'
import { siteOpenGraph, structuredDataJson } from '@/lib/site'
import { Compatibility } from './components/compatibility'
import { Faq } from './components/faq'
import { Footer } from './components/footer'
import { Hero } from './components/hero'
import { HowItWorks } from './components/how-it-works'
import { Nav } from './components/nav'
import { Principles } from './components/principles'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  // Spread, not add: naming `openGraph` here replaces the layout's whole
  // object, so anything this page does not repeat goes missing from the card.
  openGraph: { ...siteOpenGraph, url: '/' },
}

export default function Home() {
  return (
    <>
      {/* The page's own claims, in schema.org's vocabulary. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(publicOrigin()) }} />
      <Nav />
      {/* Clipped across, at the window's edge rather than the hero's column, so the
          hero ring can swell out to the side as it turns without the page scrolling sideways. */}
      <main className="flex-1 overflow-x-clip">
        <Hero />
        <HowItWorks />
        <Principles />
        <Compatibility />
        <Faq />
      </main>
      <Footer />
    </>
  )
}

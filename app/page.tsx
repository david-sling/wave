import type { Metadata } from "next";
import { siteOpenGraph } from "@/lib/site";
import { Compatibility } from "./components/compatibility";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { HowItWorks } from "./components/how-it-works";
import { Nav } from "./components/nav";
import { Principles } from "./components/principles";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  // Spread, not add: naming `openGraph` here replaces the layout's whole
  // object, so anything this page does not repeat goes missing from the card.
  openGraph: { ...siteOpenGraph, url: "/" },
};

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Principles />
        <Compatibility />
      </main>
      <Footer />
    </>
  );
}

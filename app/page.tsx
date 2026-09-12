import { Compatibility } from "./components/compatibility";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { HowItWorks } from "./components/how-it-works";
import { Nav } from "./components/nav";
import { Principles } from "./components/principles";

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

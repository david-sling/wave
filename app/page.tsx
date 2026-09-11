import { Compatibility } from "./components/compatibility";
import { CreateChannel } from "./components/create-channel";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { HowItWorks } from "./components/how-it-works";
import { Nav } from "./components/nav";
import { Principles } from "./components/principles";
import { UseCases } from "./components/use-cases";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <UseCases />
        <Principles />
        <Compatibility />
        <CreateChannel />
      </main>
      <Footer />
    </>
  );
}

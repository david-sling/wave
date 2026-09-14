import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { siteName } from "@/lib/site";
import { CreateChannelForm } from "./components/create-channel";
import { Footer } from "./components/footer";
import { ArrowRightIcon } from "./components/icons";
import { Nav } from "./components/nav";
import { Roster, Transcript, type Participant, type TranscriptItem } from "./components/transcript";
import mark from "./icon.png";

/**
 * Every address this instance does not answer to.
 *
 * A channel that has closed is not a 404: `/c/<id>` still renders and says the
 * room is gone. So whoever lands here followed a link that was mistyped or
 * lost a piece on the way, and the honest thing to show them is the room they
 * asked for: empty, never created, with nobody in it but them. The create form
 * is here because the nav's "Create a channel" points at it on every page, and
 * because a room one click away is the answer to a room that does not exist.
 */
export const metadata: Metadata = {
  title: `Page not found · ${siteName}`,
  // Next streams some not-found renders with a 200, and a crawler that sees
  // one should still not keep the page.
  robots: { index: false },
};

const room: TranscriptItem[] = [
  { type: "system", text: "You joined" },
  { type: "system", text: "Nobody else is here, and nobody was." },
  { type: "system", text: "Nothing here expired or was closed. It was never created." },
];

const you: Participant[] = [{ name: "You", role: "human", client: "", presence: "active", lastMessageAt: null }];

export default function NotFound() {
  return (
    <>
      <Nav atHome={false} />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6">
          <div className="grid gap-10 pt-14 md:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-14">
            <div className="grid gap-5">
              {/* The zero is the hand: the same mark as the logo, at the size the page deserves. */}
              <p
                role="img"
                aria-label="404"
                className="big-hand-host m-0 flex items-center font-display text-[clamp(5.5rem,13vw,10rem)] font-extrabold leading-none tracking-[-0.04em]"
              >
                <span aria-hidden>4</span>
                <span aria-hidden className="big-hand mx-[0.03em] inline-block translate-y-[0.03em]">
                  <Image src={mark} alt="" className="h-[0.82em] w-auto" priority />
                </span>
                <span aria-hidden>4</span>
              </p>

              <h1 className="m-0 max-w-[22ch] text-[clamp(1.875rem,4vw,3rem)] leading-[1.02] tracking-[-0.03em]">
                <span className="font-normal">Nobody&rsquo;s in this room,</span>
                <br />
                <span className="font-extrabold">because there isn&rsquo;t one.</span>
              </h1>

              <p className="m-0 max-w-[48ch] text-[17px] text-ink-2">
                No page and no channel answer to this address. If it came from a shared link, a piece of it was
                probably lost on the way. A channel that has closed would say so itself.
              </p>

              <CreateChannelForm />

              <Link href="/" className="link inline-block w-fit text-[14px] font-medium">
                Back to the front page{" "}
                <ArrowRightIcon size={14} className="link-arrow inline-block translate-y-px" />
              </Link>
            </div>

            <div className="panel grid gap-5 p-5 md:p-6 lg:mt-3">
              <div className="text-[13px] text-ink-2">
                <b className="font-semibold text-ink">not-found</b> · standard · empty
              </div>
              <Transcript items={room} />
              <aside className="border-t border-line-2 pt-5">
                <h2 className="m-0 mb-3 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">
                  In the channel
                </h2>
                <Roster participants={you} />
              </aside>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

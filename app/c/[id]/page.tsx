import type { Metadata } from "next";
import { ChannelView } from "@/app/components/channel/channel-view";
import { getConfig } from "@/lib/config";

/**
 * A channel (PRODUCT section 6.2).
 *
 * The server renders the frame and nothing about the channel: the invite is in
 * the URL fragment, which a page request never carries, so everything shown
 * here is fetched by the browser with that invite.
 */
export const metadata: Metadata = {
  title: "Channel · Wave",
  // A channel link is a key. Keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function ChannelPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  return <ChannelView channelId={id} host={getConfig().host} />;
}

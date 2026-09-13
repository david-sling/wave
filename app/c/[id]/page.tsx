import type { Metadata } from "next";
import { ChannelView } from "@/app/components/channel/channel-view";
import { channelMetadata, glance } from "@/lib/channel-card";
import { getConfig } from "@/lib/config";

/**
 * A channel (PRODUCT section 6.2).
 *
 * The server renders the frame and nothing about the channel: the invite is in
 * the URL fragment, which a page request never carries, so everything shown
 * here is fetched by the browser with that invite.
 *
 * The metadata is the exception, and a narrow one. A link expander fetches
 * this page the same way, without the invite, so the card it draws can say
 * only what the ID alone says: the channel's name, and whether it is still
 * here (lib/channel-card.ts).
 */
export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await params;
  return channelMetadata(id, await glance(id));
}

export default async function ChannelPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  return <ChannelView channelId={id} host={getConfig().host} />;
}

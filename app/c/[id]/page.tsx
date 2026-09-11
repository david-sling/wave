export default async function ChannelPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  void id;
  return <main />;
}

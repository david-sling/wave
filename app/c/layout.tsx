import { ChannelsPane } from '@/app/components/channel/channel-list'

export default function ChannelLayout({ children }: LayoutProps<'/c'>) {
  return (
    <div className="flex h-dvh overflow-hidden bg-panel">
      <ChannelsPane />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

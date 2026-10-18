import { connection } from 'next/server'
import { ChannelsPane } from '@/app/components/channel/channel-list'

// Rendered per request so Next can stamp proxy.ts's nonce on every script.
export default async function ChannelLayout({ children }: LayoutProps<'/c'>) {
  await connection()
  return (
    <div className="flex h-dvh overflow-hidden bg-panel">
      <ChannelsPane />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

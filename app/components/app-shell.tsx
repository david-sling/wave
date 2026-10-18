import { ChannelsPane } from './channel/channel-list'

/**
 * The application frame: the channels pane on the left, the page beside it.
 * Shared by /c and /account, so moving between a channel and the account
 * keeps the list where it is.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-panel">
      <ChannelsPane />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

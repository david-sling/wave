import { connection } from 'next/server'
import { AppShell } from '@/app/components/app-shell'

// Rendered per request so Next can stamp proxy.ts's nonce on every script.
export default async function ChannelLayout({ children }: LayoutProps<'/c'>) {
  await connection()
  return <AppShell>{children}</AppShell>
}

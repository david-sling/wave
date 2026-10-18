import { AppShell } from '@/app/components/app-shell'

export default function ChannelLayout({ children }: LayoutProps<'/c'>) {
  return <AppShell>{children}</AppShell>
}

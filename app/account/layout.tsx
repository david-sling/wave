import { AppShell } from '@/app/components/app-shell'

export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return <AppShell>{children}</AppShell>
}

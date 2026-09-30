import { Footer } from '@/app/components/footer'
import { Nav } from '@/app/components/nav'

/** The frame the sign-in pages share: the site's nav, one panel, the footer. */
export function SignInFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav atHome={false} />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 pt-14 md:pt-20">
          <div className="panel mx-auto grid w-full max-w-[440px] gap-6 p-6 md:p-8">{children}</div>
        </section>
      </main>
      <Footer />
    </>
  )
}

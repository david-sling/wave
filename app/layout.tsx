import type { Metadata } from "next";
import { Albert_Sans, Funnel_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import "sileo/styles.css";
import { publicOrigin } from "@/lib/config";
import { Analytics } from "./components/analytics";

const funnel = Funnel_Display({
  variable: "--font-funnel",
  subsets: ["latin"],
});

const albert = Albert_Sans({
  variable: "--font-albert",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "A zero-install channel where AI coding agents owned by different people exchange messages, while their humans watch and steer.";

export const metadata: Metadata = {
  // Every canonical and Open Graph URL below is written relative to this, so
  // one instance never advertises another instance's address.
  metadataBase: new URL(publicOrigin()),
  // No `template`: the channel page already sets its own full title, and a
  // template would suffix it a second time.
  title: "Wave",
  description,
  openGraph: {
    type: "website",
    siteName: "Wave",
    title: "Wave",
    description,
    locale: "en_US",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${funnel.variable} ${albert.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

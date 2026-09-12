import type { Metadata } from "next";
import { Albert_Sans, Funnel_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import "sileo/styles.css";

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

export const metadata: Metadata = {
  title: "Wave",
  description:
    "A zero-install channel where AI coding agents owned by different people exchange messages, while their humans watch and steer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${funnel.variable} ${albert.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}

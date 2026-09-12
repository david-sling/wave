# Fonts for the Open Graph image

`app/opengraph-image.tsx` renders through Satori, which reads TrueType and
cannot read the WOFF2 that `next/font` downloads. These are the same three
families the site loads at runtime, in the weights the card uses, taken from
the `latin` subset Google Fonts serves:

| File | Family | Weight | Used for |
|---|---|---|---|
| `funnel-display-400.ttf` | Funnel Display | 400 | first headline line, wordmark |
| `funnel-display-800.ttf` | Funnel Display | 800 | second headline line |
| `albert-sans-400.ttf` | Albert Sans | 400 | message bodies, meta |
| `albert-sans-600.ttf` | Albert Sans | 600 | names, badges, avatar initials |
| `geist-mono-400.ttf` | Geist Mono | 400 | inline code inside messages |

All three families are licensed under the SIL Open Font License 1.1: Funnel
Display (NORD ID, Kristian Möller), Albert Sans (Andreas Rasmussen), Geist Mono
(Vercel / basement.studio). The OFL permits redistribution of the font files
with this software; it does not permit selling the fonts on their own.

They are committed rather than fetched at build time so the card is byte-for-byte
the same on every build, including one with no network.

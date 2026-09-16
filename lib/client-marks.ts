/**
 * The marks of the tools an agent can run on: the geometry, and which client
 * string earns which.
 *
 * Referential use. These are the vendors' trademarks, not ours, and nothing on
 * any surface implies a vendor endorses or is affiliated with Wave. Each mark
 * is drawn whole, unaltered in shape, and never larger or more prominent than
 * Wave's own mark beside it.
 *
 * Paths are the official glyphs as published, not traced by hand — an
 * approximated logo is both worse craft and a worse trademark citizen than an
 * accurate one. Claude, OpenAI and Cursor come from Simple Icons (CC0 1.0,
 * https://simpleicons.org); Antigravity from Lobe Icons (MIT,
 * https://github.com/lobehub/lobe-icons), which publishes it where Simple
 * Icons does not.
 *
 * Geometry lives here rather than in a component because two renderers need
 * it: the browser, and Satori, which draws the share cards and has no DOM. A
 * mark that existed only as JSX would have to be written twice and would drift.
 *
 * Colour: Claude keeps its coral, since that hue is most of how the mark is
 * recognised. The rest are ink, except Antigravity, whose brand mark is drawn
 * in its own aurora colours by `ANTIGRAVITY_COLOR` below and the
 * `ClientMark` component that reads it. This flat, single-colour entry stays
 * on the page's ink for the one renderer that cannot draw the aurora: Satori,
 * which has no `<mask>` or `<filter>` and draws the share cards (`lib/og.tsx`).
 */

import { vendorOf } from "./vendors";

/** This page's ink, for the marks whose own colour is black or unavailable. */
const INK = "#15161a";

export type ClientMark = {
  /** A filled glyph on a 24-unit grid. */
  d: string;
  /** What to fill it with wherever a mark is drawn in its own colour. */
  brand: string;
  fillRule?: "evenodd";
};

const MARKS = {
  claude: { d: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z", brand: "#D97757" },
  openai: { d: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z", brand: INK },
  cursor: { d: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23", brand: INK },
  antigravity: { d: "M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z", brand: INK, fillRule: "evenodd" },
} as const satisfies Record<string, ClientMark>;

/**
 * Antigravity's brand mark as Lobe Icons' `Color` variant draws it: the same
 * outline above, used as a mask, over eleven blurred, coloured blobs — the
 * aurora look Google gives it. Kept as data rather than JSX because the
 * `<mask>` and each blob's `<filter>` need ids scoped to one render, and only
 * the browser component in `agent-marks.tsx` can call `useId` for that.
 */
export const ANTIGRAVITY_COLOR = {
  /** The mask every blob is clipped to; identical to `MARKS.antigravity.d`. */
  mask: MARKS.antigravity.d,
  blobs: [
    { d: "M-1.018-3.992c-.408 3.591 2.686 6.89 6.91 7.37 4.225.48 7.98-2.043 8.387-5.633.408-3.59-2.686-6.89-6.91-7.37-4.225-.479-7.98 2.043-8.387 5.633z", fill: "#FFE432", blur: 1.117, x: -3.288, y: -11.917, width: 19.838, height: 17.587 },
    { d: "M15.269 7.747c1.058 4.557 5.691 7.374 10.348 6.293 4.657-1.082 7.575-5.653 6.516-10.21-1.058-4.556-5.691-7.374-10.348-6.292-4.657 1.082-7.575 5.653-6.516 10.21z", fill: "#FC413D", blur: 5.4, x: 4.251, y: -13.493, width: 38.9, height: 38.565 },
    { d: "M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z", fill: "#00B95C", blur: 4.591, x: -21.889, y: -10.592, width: 40.955, height: 36.517 },
    { d: "M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z", fill: "#00B95C", blur: 4.591, x: -21.889, y: -10.592, width: 40.955, height: 36.517 },
    { d: "M-7.608 14.703c3.352 3.424 9.126 3.208 12.896-.483 3.77-3.69 4.108-9.459.756-12.883C2.69-2.087-3.083-1.871-6.853 1.82c-3.77 3.69-4.108 9.458-.755 12.883z", fill: "#00B95C", blur: 4.591, x: -19.099, y: -10.278, width: 36.632, height: 36.595 },
    { d: "M9.932 27.617c1.04 4.482 5.384 7.303 9.7 6.3 4.316-1.002 6.971-5.448 5.93-9.93-1.04-4.483-5.384-7.304-9.7-6.301-4.316 1.002-6.971 5.448-5.93 9.93z", fill: "#3186FF", blur: 4.363, x: 0.981, y: 8.758, width: 33.533, height: 34.087 },
    { d: "M2.572-8.185C.392-3.329 2.778 2.472 7.9 4.771c5.122 2.3 11.042.227 13.222-4.63 2.18-4.855-.205-10.656-5.327-12.955-5.122-2.3-11.042-.227-13.222 4.63z", fill: "#FBBC04", blur: 3.954, x: -6.143, y: -21.659, width: 35.978, height: 35.276 },
    { d: "M-3.267 38.686c-5.277-2.072 3.742-19.117 5.984-24.83 2.243-5.712 8.34-8.664 13.616-6.592 5.278 2.071 11.533 13.482 9.29 19.195-2.242 5.713-23.613 14.298-28.89 12.227z", fill: "#3186FF", blur: 3.531, x: -11.96, y: -0.46, width: 45.114, height: 46.523 },
    { d: "M28.71 17.471c-1.413 1.649-5.1.808-8.236-1.878-3.135-2.687-4.531-6.201-3.118-7.85 1.412-1.649 5.1-.808 8.235 1.878s4.532 6.2 3.119 7.85z", fill: "#749BFF", blur: 3.159, x: 10.485, y: 0.58, width: 25.094, height: 24.054 },
    { d: "M18.163 9.077c5.81 3.93 12.502 4.19 14.946.577 2.443-3.612-.287-9.727-6.098-13.658-5.81-3.931-12.502-4.19-14.946-.577-2.443 3.612.287 9.727 6.098 13.658z", fill: "#FC413D", blur: 2.669, x: 5.833, y: -12.467, width: 33.508, height: 30.007 },
    { d: "M-.915 2.684c-1.44 3.473-.97 6.967 1.05 7.804 2.02.837 4.824-1.3 6.264-4.772 1.44-3.473.97-6.967-1.05-7.804-2.02-.837-4.824 1.3-6.264 4.772z", fill: "#FFEE48", blur: 3.303, x: -8.355, y: -8.876, width: 22.194, height: 26.151 },
  ],
} as const;

/**
 * The mark for a client string an agent reported, or null when there is none.
 *
 * Null is the normal case, not the error case. An agent reports whatever its
 * join prompt was told to send, an agent that is only a shell loop has no mark
 * by definition, and a tool can ship before its glyph is published anywhere we
 * can take it from accurately. So every surface that draws a mark has to look
 * right without one, and none of them may use a mark as the only thing telling
 * two participants apart.
 *
 * Matching is on the front of the string because the client is self-reported:
 * "Claude Code", "claude-code" and "Claude Code 2.1" are all the same tool
 * saying so slightly differently.
 *
 * Products whose mark is their own come first, because a mark is the product's
 * where one exists: Antigravity is Google's, but the aurora glyph is its own
 * and no Google mark stands in for it. Everything else falls through to the
 * vendor, which is what makes `gpt-5` and `anthropic` resolve — both drew
 * nothing until the rule moved into `vendors.ts` and stopped being written
 * twice. Google has no mark here, so a Gemini client still draws none.
 */
export function markOf(client: string | undefined): ClientMark | null {
  if (!client) return null;
  const key = client.trim().toLowerCase();
  if (key.startsWith("cursor")) return MARKS.cursor;
  if (key.startsWith("antigravity")) return MARKS.antigravity;
  switch (vendorOf(client)) {
    case "anthropic":
      return MARKS.claude;
    case "openai":
      return MARKS.openai;
    default:
      return null;
  }
}

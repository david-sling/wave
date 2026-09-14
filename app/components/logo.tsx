import Image from "next/image";
import Link from "next/link";
import mark from "../icon.png";

export function Logo({ size = 28, wordmarkClassName = "" }: { size?: number; wordmarkClassName?: string }) {
  return (
    <Link
      href="/"
      className="logo-link inline-flex items-center gap-2.5 font-display text-[19px] font-bold tracking-[-0.02em] no-underline"
    >
      <Image className="logo-mark" src={mark} alt="" width={size} height={size} priority />
      <span className={wordmarkClassName}>Wave</span>
    </Link>
  );
}

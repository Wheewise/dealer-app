import Image from "next/image";
import Link from "next/link";

export function Logo({
  variant = "wordmark",
  size = 32,
  href = "/",
}: {
  variant?: "wordmark" | "mark";
  size?: number;
  href?: string | null;
}) {
  // wordmark: /wheewise-wordmark.png is a trimmed, alpha-transparent crop of
  // the real logo (627x98) — the raw /brand/wordmark.png is a 1000x1000
  // canvas with the actual wordmark as a small centered island surrounded by
  // solid white padding, which is why it used to render nearly invisible at
  // navbar sizes (mostly empty space at any reasonable height). Passing the
  // real 627x98 aspect ratio here (rather than the old guessed 4:1) keeps
  // Next/Image's auto aspect-ratio CSS correct so `width: "auto"` doesn't
  // stretch or letterbox it.
  const src = variant === "wordmark" ? "/wheewise-wordmark.png" : "/brand/wheewise.png";
  const width = variant === "wordmark" ? 627 : size;
  const height = variant === "wordmark" ? 98 : size;
  const img = (
    <Image
      src={src}
      alt="Wheewise"
      width={width}
      height={height}
      priority
      style={{ height: size, width: "auto" }}
    />
  );
  return href ? (
    <Link href={href} className="inline-flex items-center">
      {img}
    </Link>
  ) : (
    img
  );
}

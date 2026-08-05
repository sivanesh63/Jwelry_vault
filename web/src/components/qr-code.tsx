"use client";

/**
 * A rendered QR code, and the printable label it goes on.
 *
 * The label carries the item's name and weight alongside the code, because a
 * locker full of identical black squares is no more searchable than a locker
 * full of unlabelled pouches. The code is for the phone; the text is for the
 * person holding it.
 */

import { useMemo } from "react";
import { qrSvgPath, type QrOptions } from "@/lib/qr";

export function QrCodeSvg({
  value,
  className,
  level,
}: {
  value: string;
  className?: string;
  level?: QrOptions["level"];
}) {
  // Encoding walks every module twice and runs mask-penalty scoring eight
  // times. Cheap once, wasteful on every re-render of a thirty-label sheet.
  const { path, size } = useMemo(() => qrSvgPath(value, { level }), [value, level]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      // Explicit white behind the code: printed on a dark-themed screenshot or
      // a coloured sticker, a transparent background makes it unreadable, and
      // the failure only shows up after the sheet is printed.
      style={{ background: "#fff" }}
      role="img"
      aria-hidden="true"
      // Crisp edges matter: at sticker size the modules are barely a
      // millimetre, and antialiasing blurs the boundary a reader depends on.
      shapeRendering="crispEdges"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}

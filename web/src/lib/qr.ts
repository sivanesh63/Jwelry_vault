"use client";

/**
 * QR codes for jewelry labels.
 *
 * The code encodes a full URL, not a bare id. That is the decision everything
 * else follows from: a URL means the phone's own camera app recognises it and
 * opens the vault on that item, from the lock screen, with nothing installed
 * and no scanner in the way. A bare id would work only inside this app, which
 * is the one place you already have a search box.
 *
 * The in-app scanner still exists, and earns its place in one flow — verifying
 * a locker, where you scan twenty pouches in a row and being thrown into a new
 * page each time would make it unusable.
 *
 * Rendered as SVG rather than canvas: these get printed on small stickers, and
 * a vector stays sharp at whatever size the sheet ends up being.
 */

import { useSyncExternalStore } from "react";
import qrcode from "qrcode-generator";

const noop = () => () => {};

/**
 * The site's own origin, safe to read during render.
 *
 * A static export has no origin at build time, and reading `window` directly
 * would make the exported HTML disagree with the first client render — React
 * calls that a hydration mismatch and the QR would be built from the wrong
 * string for one frame.
 *
 * useSyncExternalStore is the sanctioned way to read a value that differs
 * between build and browser: the third argument is what the build sees, the
 * second is what the browser sees, and React reconciles them after hydration
 * without an effect and without a warning.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
}

export interface QrOptions {
  /**
   * Error-correction level. "M" recovers ~15% and is the right trade here:
   * these stickers live in a locker and get handled, so some tolerance for
   * scuffing matters, but "H" would make the modules smaller at the same
   * printed size and harder for a phone to resolve.
   */
  level?: "L" | "M" | "Q" | "H";
  /** Quiet zone in modules. The spec says 4; less and some readers refuse. */
  margin?: number;
}

/** The scannable URL for an item. */
export function itemUrl(origin: string, jewelryId: string): string {
  return `${origin}/jewelry/item/?id=${jewelryId}`;
}

/**
 * Pulls an item id back out of whatever a scanner returned.
 *
 * Accepts a full URL from a printed label, or a bare uuid — somebody reading
 * the id off an item's detail screen and typing it in should not have to know
 * the difference.
 */
export function parseScanned(raw: string): string | null {
  const text = raw.trim();
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  try {
    const url = new URL(text);
    const id = url.searchParams.get("id");
    if (id && uuid.test(id)) return id;
  } catch {
    // Not a URL. Fall through to the bare-uuid case.
  }

  const match = text.match(uuid);
  return match ? match[0] : null;
}

/**
 * The QR as a PNG, with the item's name printed underneath.
 *
 * Painted module by module onto a canvas rather than rasterising the SVG. The
 * SVG route means loading it through an Image element, which brings CORS
 * tainting, font substitution and a load event to wait on — all for a picture
 * of squares this code already knows the coordinates of.
 *
 * The caption is the reason this is worth downloading at all. Five bare QR
 * files in a downloads folder are indistinguishable; with the name on the image
 * you can lay them out, print a sheet, and cut them up without once guessing
 * which is which.
 */
export async function qrPngBlob(
  text: string,
  caption: string,
  options: QrOptions & { scale?: number } = {},
): Promise<Blob> {
  const { level = "M", margin = 4, scale = 12 } = options;

  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const side = (count + margin * 2) * scale;
  const captionHeight = caption ? Math.round(side * 0.14) : 0;

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side + captionHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the QR code");

  // White across the whole canvas, including under the caption. A transparent
  // PNG printed on anything but white paper stops scanning.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
      }
    }
  }

  if (caption) {
    const fontSize = Math.round(captionHeight * 0.42);
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Trimmed to fit rather than allowed to run off the edge. A name that
    // overflows would be silently cut mid-word by the canvas bounds.
    let label = caption;
    while (label.length > 4 && ctx.measureText(label).width > side * 0.9) {
      label = `${label.slice(0, -2)}…`;
    }
    ctx.fillText(label, side / 2, side + captionHeight / 2);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the PNG"))),
      "image/png",
    );
  });
}

/** Saves a blob under a filename a file manager will accept. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // before the browser has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Strips what Windows, macOS and Android each refuse in a filename. */
export function safeFilename(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * An SVG path covering every dark module.
 *
 * One path rather than a rect per module: a version-4 code is ~1,300 modules,
 * and 1,300 DOM nodes per label makes a printable sheet of thirty labels
 * genuinely slow to render.
 */
export function qrSvgPath(text: string, options: QrOptions = {}): {
  path: string;
  size: number;
} {
  const { level = "M", margin = 4 } = options;

  // Type 0 lets the library pick the smallest version that fits.
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + margin * 2;

  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }

  return { path, size };
}

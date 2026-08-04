/**
 * Preparing a photo before it is encrypted and uploaded.
 *
 * Two jobs, and the second is the one nobody thinks about.
 *
 * 1. Shrink it. A phone photo is 3–6 MB; the vault needs roughly 400 KB. That
 *    difference decides whether about 600 photos fit in the free tier or 80.
 *
 * 2. Strip the metadata. A photo of a necklace taken on the dining table
 *    carries the GPS coordinates of the dining table. It also carries the
 *    camera's serial number, and the exact second it was taken. For a vault
 *    whose whole purpose is not telling anyone where the gold is, shipping the
 *    house's latitude inside the picture of it would undo the rest of this
 *    work.
 *
 * Drawing to a canvas and re-encoding does both at once: the canvas holds
 * pixels and nothing else, so every EXIF, GPS, XMP and maker-note field is gone
 * by construction rather than by a stripping routine that might miss a tag.
 *
 * The one thing a canvas also discards is orientation. Phones store portrait
 * photos as landscape plus an "orientation: 6" tag, so a naive re-encode turns
 * them sideways. `createImageBitmap` with `imageOrientation: "from-image"`
 * applies the rotation to the pixels first, which is why it is used instead of
 * an <img> element.
 */

import type { Bytes } from "./crypto";

export interface PreparedImage {
  bytes: Bytes;
  width: number;
  height: number;
  /** Always "image/jpeg" or "image/webp" — never the original type. */
  type: string;
}

export interface PrepareOptions {
  /** Longest edge, in pixels. 1600 is plenty to read a hallmark stamp. */
  maxEdge?: number;
  /** Bytes. The quality search stops as soon as it fits. */
  targetBytes?: number;
}

const DEFAULTS = { maxEdge: 1600, targetBytes: 400 * 1024 };

/**
 * The largest file we will even attempt to decode.
 *
 * Not about storage — the output is 400 KB whatever goes in. It is about
 * memory: `createImageBitmap` decodes to raw pixels, so a 108-megapixel phone
 * shot expands to roughly 400 MB in RAM before a single byte is written. On a
 * mid-range phone that kills the tab, and a tab that vanishes mid-upload gives
 * the user nothing to act on.
 *
 * 30 MB is far above any camera roll photo and far below the point where
 * decoding is dangerous.
 */
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/**
 * HEIC is what an iPhone shoots by default, and only Safari can decode it in a
 * canvas. Everywhere else `createImageBitmap` throws, so the failure is caught
 * and turned into a sentence a person can act on rather than a stack trace.
 */
function isProbablyUndecodable(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export async function prepareImage(
  file: File,
  options: PrepareOptions = {},
): Promise<PreparedImage> {
  const { maxEdge, targetBytes } = { ...DEFAULTS, ...options };

  // Checked before decoding, not after. Once createImageBitmap is called the
  // memory is already committed, so a check afterwards would run in a tab that
  // may not survive to perform it.
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `That image is ${Math.round(file.size / 1_000_000)} MB, which is too large to process on a phone. ` +
        `Photos straight from a camera are normally well under 30 MB.`,
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (isProbablyUndecodable(file)) {
      throw new Error(
        "This browser cannot read HEIC photos. On iPhone, set Camera → Formats → Most Compatible, or share the photo as JPEG.",
      );
    }
    throw new Error("That file is not an image this browser can read.");
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not prepare the image for upload.");
    // Jewelry photos are detail shots; the good downscaler is worth the cost.
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    // WebP where it exists, which is most of a decade of browsers now, and is
    // roughly 30% smaller than JPEG at the same visual quality.
    const type = canvas.toDataURL("image/webp").startsWith("data:image/webp")
      ? "image/webp"
      : "image/jpeg";

    // Walk quality down rather than binary-searching: five encodes of a 1600px
    // image is a few hundred milliseconds, and the descending walk always
    // returns the best quality that fits instead of whichever the search
    // happened to land on.
    let blob: Blob | null = null;
    for (const quality of [0.82, 0.72, 0.62, 0.5, 0.4]) {
      blob = await toBlob(canvas, type, quality);
      if (blob && blob.size <= targetBytes) break;
    }
    if (!blob) throw new Error("Could not compress the image.");

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width,
      height,
      type,
    };
  } finally {
    // Bitmaps hold decoded pixels — several megabytes each. On a phone
    // uploading ten photos, not releasing them is the difference between
    // working and the tab being killed.
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A PDF invoice cannot be re-encoded to strip metadata the way an image can —
 * doing that properly means parsing PDF, which is a large dependency and a
 * large attack surface for a small gain. So PDFs go up as they are, and the
 * author/producer fields inside them go with them.
 *
 * This is fine because the whole file is encrypted before upload. It is worth
 * stating rather than leaving implicit: the guarantee for documents comes
 * entirely from the envelope, not from sanitising the contents.
 */
export async function prepareDocument(file: File): Promise<{ bytes: Bytes; type: string }> {
  if (file.type.startsWith("image/")) {
    const image = await prepareImage(file, { maxEdge: 2200, targetBytes: 600 * 1024 });
    return { bytes: image.bytes, type: image.type };
  }
  return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type || "application/pdf" };
}

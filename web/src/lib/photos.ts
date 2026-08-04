"use client";

/**
 * Photos and documents: shrink, strip, seal, upload.
 *
 * Nothing readable ever reaches Supabase Storage. The pipeline is
 *
 *   file → canvas re-encode → AES-GCM envelope → upload
 *
 * and the middle step is doing two jobs at once. It shrinks a 5 MB phone photo
 * to roughly 400 KB, and because a canvas holds pixels and nothing else, every
 * EXIF, GPS and maker-note field is gone by construction rather than by a
 * stripping routine that might miss a tag. See image.ts.
 *
 * The stored object is a version byte, an IV and ciphertext. Anyone reading the
 * bucket — including Supabase — sees noise.
 *
 *
 * PATHS
 *
 *   <family_id>/<jewelry_id>/<uuid>.webp
 *
 * The family id must lead, because the storage policies in 0004 decide access
 * from the object name alone. The extension describes the *plaintext*, so the
 * browser knows what it is holding after decryption; the stored bytes are
 * declared application/octet-stream, which is what they honestly are.
 *
 * Each envelope is bound to its own path as additional authenticated data, so
 * a photo moved to another item's folder fails to open rather than quietly
 * appearing on the wrong necklace.
 */

import { useEffect, useState } from "react";
import { aadFor, openBytes, sealBytes, type Bytes, type VaultKey } from "./crypto";
import { prepareDocument, prepareImage } from "./image";
import { useKeyVault } from "./keyvault";
import { getSupabase } from "./supabase";

const PHOTO_BUCKET = "jewelry-photos";
const DOCUMENT_BUCKET = "documents";

/**
 * Per-file caps, mirroring `file_size_limit` in 0004_storage.sql.
 *
 * Duplicated deliberately, and checked here first. Supabase enforces these
 * server-side, but its rejection arrives as "The object exceeded the maximum
 * allowed size" — after the whole file has been compressed, encrypted and
 * uploaded. Failing early costs nothing and can say something useful.
 *
 * Photos never approach theirs: compression targets 400 KB, so 5 MB is a
 * backstop for a pathological case rather than a limit anyone meets. Documents
 * are different — a scanned PDF is passed through untouched.
 */
export const MAX_STORED_BYTES = {
  photo: 5 * 1024 * 1024,
  document: 10 * 1024 * 1024,
} as const;

/** Every stored object declares this. The truth of the bytes, not of the image. */
const STORED_TYPE = "application/octet-stream";

function extensionFor(mime: string): string {
  return mime === "image/webp" ? "webp" : mime === "application/pdf" ? "pdf" : "jpg";
}

function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

async function upload(
  bucket: string,
  key: VaultKey,
  path: string,
  bytes: Bytes,
  limit: number,
): Promise<void> {
  // Measured against the sealed size, since that is what the bucket sees.
  if (bytes.length + ENVELOPE_OVERHEAD > limit) {
    throw new Error(
      `That file is ${formatMb(bytes.length)} after compression, over the ${formatMb(limit)} limit. ` +
        `Photograph the document instead of scanning it, or split it into pages.`,
    );
  }
  const sealed = await sealBytes(key, bytes, aadFor("storage", path));
  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(path, new Blob([sealed as BlobPart], { type: STORED_TYPE }), {
      contentType: STORED_TYPE,
      upsert: false,
    });
  if (error) throw new Error(error.message);
}

/**
 * Prepares and stores one photo, returning the path to keep on the item.
 *
 * `jewelryId` has to exist before this is called — the path contains it and the
 * envelope is bound to the path — which is why the edit screen mints an id on
 * the first photo rather than at save time.
 */
export interface UploadedPhoto {
  path: string;
  /** What came off the camera. */
  originalBytes: number;
  /** What is actually stored, envelope included. */
  storedBytes: number;
}

export async function uploadPhoto(
  key: VaultKey,
  familyId: string,
  jewelryId: string,
  file: File,
): Promise<UploadedPhoto> {
  const image = await prepareImage(file);
  const path = `${familyId}/${jewelryId}/${crypto.randomUUID()}.${extensionFor(image.type)}`;
  await upload(PHOTO_BUCKET, key, path, image.bytes, MAX_STORED_BYTES.photo);
  return {
    path,
    originalBytes: file.size,
    // ENVELOPE_OVERHEAD, not image.bytes.length: what counts against the
    // storage quota is the sealed object, and quoting the plaintext size would
    // make the total quietly wrong.
    storedBytes: image.bytes.length + ENVELOPE_OVERHEAD,
  };
}

/** Version byte + 12-byte IV + 16-byte GCM tag. See the envelope in crypto.ts. */
const ENVELOPE_OVERHEAD = 1 + 12 + 16;

export async function uploadDocument(
  key: VaultKey,
  familyId: string,
  jewelryId: string,
  file: File,
): Promise<string> {
  const doc = await prepareDocument(file);
  const path = `${familyId}/${jewelryId}/${crypto.randomUUID()}.${extensionFor(doc.type)}`;
  await upload(DOCUMENT_BUCKET, key, path, doc.bytes, MAX_STORED_BYTES.document);
  return path;
}

/** Whole megabytes, for a message rather than a readout. */
function formatMb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

export async function downloadDecrypted(
  key: VaultKey,
  bucket: string,
  path: string,
): Promise<Bytes> {
  const { data, error } = await getSupabase().storage.from(bucket).download(path);
  if (error) throw new Error(error.message);
  const sealed = new Uint8Array(await data.arrayBuffer());
  const plain = await openBytes(key, sealed, aadFor("storage", path));
  if (!plain) throw new Error("That file is empty");
  return plain;
}

/** Deleting is admin-only; 0004 grants the delete policy to admins alone. */
export async function deleteStored(bucket: string, path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);
}

export function deletePhoto(path: string): Promise<void> {
  return deleteStored(PHOTO_BUCKET, path);
}

/**
 * A displayable URL for an encrypted photo.
 *
 * Signed URLs cannot be used here: the object at the far end is ciphertext, so
 * an <img> pointed at it renders nothing. The bytes have to come back through
 * the key first, which is why this ends in a blob: URL made from the decrypted
 * result.
 *
 * The URL is revoked on unmount. Without that, scrolling a list of items would
 * pin every decrypted photo in memory for the life of the page.
 */
export function usePhotoUrl(path?: string): { url: string | null; error: string | null } {
  const { key } = useKeyVault();

  // The result is stored with the path it was decrypted from, so switching
  // items yields null immediately by derivation rather than by a reset. A
  // synchronous setState in the effect body would be a wasted render, and for a
  // beat the old item's photo would still be on screen under the new item's
  // name — which on a jewelry list is exactly the wrong thing to show.
  const [result, setResult] = useState<{ path: string; url: string } | null>(null);
  const [failure, setFailure] = useState<{ path: string; message: string } | null>(null);

  useEffect(() => {
    if (!key || !path) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    void downloadDecrypted(key, PHOTO_BUCKET, path)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([bytes as BlobPart], { type: mimeFor(path) }),
        );
        setResult({ path, url: objectUrl });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFailure({ path, message: e instanceof Error ? e.message : String(e) });
        }
      });

    return () => {
      cancelled = true;
      // Without this, scrolling a list would pin every decrypted photo in
      // memory for the life of the page.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, path]);

  return {
    url: result && result.path === path ? result.url : null,
    error: failure && failure.path === path ? failure.message : null,
  };
}

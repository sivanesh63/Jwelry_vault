"use client";

/**
 * Full-screen photo viewer.
 *
 * Exists because a 160px thumbnail cannot show a hallmark stamp, a clasp, or
 * the setting of a stone — which is most of why anyone photographs jewelry.
 *
 * Each image is fetched and decrypted on demand, exactly as the thumbnails are.
 * There is no URL that renders one of these without the family key, so there is
 * nothing here to right-click and share by accident.
 */

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { usePhotoUrl } from "@/lib/photos";
import { useI18n } from "@/lib/i18n";

export function PhotoViewer({
  paths,
  index,
  onIndex,
  onClose,
}: {
  paths: string[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { url, error } = usePhotoUrl(paths[index]);
  const many = paths.length > 1;

  const step = useCallback(
    (delta: number) => onIndex((index + delta + paths.length) % paths.length),
    [index, onIndex, paths.length],
  );

  useEffect(() => {
    // Arrow keys and Escape are what people reach for without being told, and
    // on a laptop this is the only way to move between photos without aiming.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);

    // The page behind must not scroll while this is open — on a phone, dragging
    // to pan a zoomed photo would otherwise scroll the item page underneath.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, step]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      // Closing on backdrop click, but not when the click began on the image —
      // otherwise dragging a zoomed photo and releasing outside it dismisses
      // the thing you were looking at.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("nav.close")}
        className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {many ? (
        <p className="absolute left-1/2 top-5 -translate-x-1/2 text-sm tabular-nums text-white/70">
          {index + 1} / {paths.length}
        </p>
      ) : null}

      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          // max-h/max-w rather than object-cover: cropping is what the
          // thumbnail already did, and this view exists to undo it.
          className="max-h-[92vh] max-w-[96vw] select-none object-contain"
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-white/70">
          {error ? (
            error
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("common.loading")}
            </>
          )}
        </p>
      )}

      {many ? (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t("common.previous")}
            className="absolute left-2 flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t("common.next")}
            className="absolute right-2 flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      ) : null}
    </div>
  );
}

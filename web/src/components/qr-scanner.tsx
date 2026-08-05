"use client";

/**
 * Camera QR scanning, live in the page.
 *
 * Two decoders, because there is no single one that works everywhere:
 *
 *   BarcodeDetector  native, hardware-accelerated, and absent from Safari —
 *                    which is most of this family's phones
 *   jsQR             pure JavaScript, works anywhere a canvas does, slower
 *
 * The native path is tried first and quietly falls back. Shipping only jsQR
 * would waste the fast path on Android; shipping only BarcodeDetector would
 * leave every iPhone with a dead button.
 *
 * Worth saying what this is *not* for: opening one item. The phone's own camera
 * app already reads these labels and opens the vault, because the code encodes
 * a URL. This exists for verifying a locker — twenty pouches in a row, where
 * being thrown into a new page after each one would make the job unbearable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** Roughly four looks per second. Faster burns battery for no extra hit rate. */
const SCAN_INTERVAL_MS = 250;

export function QrScanner({
  onScan,
  className,
}: {
  /** Called with the raw decoded text. Repeats are already filtered out. */
  onScan: (text: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The same sticker stays in frame for many ticks. Without this, one pouch
  // held up to the camera would fire a hundred times a second.
  const lastRef = useRef<{ text: string; at: number } | null>(null);

  // Kept fresh in an effect rather than assigned during render. The point is
  // that `onScan` changing must not restart the camera — the parent rebuilds it
  // whenever the scan mode changes, and tearing down the video stream mid-count
  // would lose the tally and flash the viewfinder.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const accept = useCallback((text: string) => {
    const now = performance.now();
    const last = lastRef.current;
    if (last && last.text === text && now - last.at < 2500) return;
    lastRef.current = { text, at: now };
    onScanRef.current(text);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera, and a resolution high enough that a sticker-sized
          // code still resolves. Left to itself a phone often picks the front.
          video: { facingMode: "environment", width: { ideal: 1280 } },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        const native = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;

        const tick = async () => {
          if (stopped || !videoRef.current || videoRef.current.readyState < 2) return;
          const v = videoRef.current;

          if (native) {
            try {
              const found = await native.detect(v);
              if (found[0]?.rawValue) accept(found[0].rawValue);
              return;
            } catch {
              // A detector that throws mid-session — some Android builds do —
              // should degrade to jsQR rather than stop scanning entirely.
            }
          }

          const canvas = (canvasRef.current ??= document.createElement("canvas"));
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx || canvas.width === 0) return;
          ctx.drawImage(v, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(pixels.data, pixels.width, pixels.height, {
            inversionAttempts: "dontInvert",
          });
          if (result?.data) accept(result.data);
        };

        timer = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
      } catch (e) {
        // Denied permission, no camera, or an insecure origin. All three end
        // with the same thing the user needs: the manual entry box below.
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    void start();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      // Releasing the track is what turns the camera light off. Skipping it
      // leaves a phone recording behind a closed page.
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [accept]);

  if (error) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
          <CameraOff className="size-8" />
          <p>{t("scan.cameraDenied")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          // playsInline and muted together are what stop iOS opening the
          // stream in its own full-screen player instead of in the page.
          className="aspect-video w-full object-cover"
        />
        {!ready ? (
          <span className="absolute inset-0 flex items-center justify-center text-white/70">
            <Loader2 className="size-6 animate-spin" />
          </span>
        ) : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="size-40 max-w-[60%] rounded-lg border-2 border-white/70" />
          </span>
        )}
      </div>
    </div>
  );
}

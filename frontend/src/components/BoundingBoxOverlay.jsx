import { useEffect, useRef, useState } from "react";

/**
 * Renders an image with absolutely-positioned bounding-box overlays.
 * Boxes use NORMALIZED coordinates (0-1).
 */
export default function BoundingBoxOverlay({ src, regions = [], processing = false, className = "" }) {
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-black/5 dark:bg-black/40 ${
        processing ? "scan-shimmer" : ""
      } ${className}`}
      data-testid="scan-image-wrapper"
    >
      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt="medical scan"
          onLoad={() => setLoaded(true)}
          className="block w-full h-auto select-none"
          draggable={false}
          data-testid="scan-image"
        />
      ) : (
        <div className="aspect-[4/3] flex items-center justify-center text-muted-foreground text-sm">
          No image
        </div>
      )}

      {loaded &&
        regions.map((r, i) => {
          const left = `${(r.x ?? 0) * 100}%`;
          const top = `${(r.y ?? 0) * 100}%`;
          const width = `${(r.width ?? 0) * 100}%`;
          const height = `${(r.height ?? 0) * 100}%`;
          return (
            <div
              key={i}
              data-testid={`bbox-${i}`}
              className="absolute border-2 border-bbox bg-bbox/10 transition-all"
              style={{
                left,
                top,
                width,
                height,
                boxShadow: "0 0 18px hsl(var(--bbox) / 0.45)",
              }}
            >
              <span className="absolute -top-6 left-0 bg-bbox text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap">
                {r.label} · {Math.round(r.confidence ?? 0)}%
              </span>
            </div>
          );
        })}
    </div>
  );
}

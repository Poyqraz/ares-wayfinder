import { useRef, useState, type PointerEvent } from "react";
import { groundRect, selectionAspect, type GroundBounds, type PixelPoint } from "./magnifier.ts";

export type MagnifierResolution = "native-ctx" | "higher-resolution" | "enlarged-low-resolution";

type Drag = { x0: number; y0: number; x1: number; y1: number };

function resolutionText(resolution: MagnifierResolution): string {
  switch (resolution) {
    case "native-ctx":
      return "Native CTX resolution";
    case "higher-resolution":
      return "Higher-resolution asset";
    case "enlarged-low-resolution":
      return "Enlarging low-resolution CTX";
    default: {
      const unreachable: never = resolution;
      return unreachable;
    }
  }
}

export function OrbitalMagnifier({
  imageUrl,
  bounds,
  northUp = false,
  resolution = "enlarged-low-resolution",
  scaleLabel = null,
  validatedDataset = false,
  disabledReason = "No validated analysis dataset is connected.",
  pixelToGround,
  onSelectRect,
}: {
  imageUrl?: string | null;
  bounds?: GroundBounds | null;
  northUp?: boolean;
  resolution?: MagnifierResolution;
  scaleLabel?: string | null;
  validatedDataset?: boolean;
  disabledReason?: string;
  pixelToGround?: (pixel: PixelPoint) => { lat: number; lon: number } | null;
  onSelectRect?: (bounds: GroundBounds) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<GroundBounds | null>(null);
  const connected = bounds != null && pixelToGround != null;

  const localPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const box = drag
    ? {
        left: Math.min(drag.x0, drag.x1),
        top: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0),
        height: Math.abs(drag.y1 - drag.y0),
      }
    : null;
  const aspect = selected ? selectionAspect(selected) : null;

  return (
    <section className="ui-magnifier" data-testid="orbital-magnifier">
      <p>{resolutionText(resolution)}</p>
      <p data-testid="scale-label">{scaleLabel ?? "Scale unavailable"}</p>
      {northUp ? <p data-testid="north-indicator">N</p> : null}
      {connected ? <p data-testid="roi-bounds">{bounds.west}, {bounds.south}, {bounds.east}, {bounds.north}</p> : <p data-testid="mapping-absent">Mapping API not connected</p>}
      <div
        className="ui-frame"
        ref={frame}
        data-testid="magnifier-frame"
        onPointerDown={(event) => {
          if (!connected) return;
          const point = localPoint(event);
          if (!point) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = { x0: point.x, y0: point.y, x1: point.x, y1: point.y };
          dragRef.current = start;
          setDrag(start);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const point = localPoint(event);
          if (!point) return;
          const next = { ...dragRef.current, x1: point.x, y1: point.y };
          dragRef.current = next;
          setDrag(next);
        }}
        onPointerUp={(event) => {
          const current = dragRef.current;
          dragRef.current = null;
          if (!current || !pixelToGround || !bounds) return;
          const point = localPoint(event);
          if (!point) return;
          const next = { ...current, x1: point.x, y1: point.y };
          setDrag(null);
          const width = Math.abs(next.x1 - next.x0);
          const height = Math.abs(next.y1 - next.y0);
          if (width < 4 || height < 4) return;
          const nw = pixelToGround({ x: Math.min(next.x0, next.x1), y: Math.min(next.y0, next.y1), width: point.width, height: point.height });
          const se = pixelToGround({ x: Math.max(next.x0, next.x1), y: Math.max(next.y0, next.y1), width: point.width, height: point.height });
          const ground = groundRect(nw, se);
          if (!ground) return;
          setSelected(ground);
          onSelectRect?.(ground);
        }}
      >
        {imageUrl ? <img src={imageUrl} alt="Regional preview" /> : <p>Image not supplied.</p>}
        {box && box.width > 0 ? <span className="ui-select" data-testid="selection-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} /> : null}
      </div>
      {selected && aspect ? (
        <div className="ui-detail" data-testid="magnified-view" style={{ aspectRatio: `${aspect}` }}>
          <p>{selected.west.toFixed(5)}, {selected.south.toFixed(5)}, {selected.east.toFixed(5)}, {selected.north.toFixed(5)}</p>
        </div>
      ) : null}
      <button type="button" disabled={!validatedDataset} data-testid="route-handoff">{validatedDataset ? "Open route planning" : disabledReason}</button>
    </section>
  );
}

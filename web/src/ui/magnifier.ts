export type GroundPoint = { lat: number; lon: number };

export type GroundBounds = { west: number; south: number; east: number; north: number };

export type PixelPoint = { x: number; y: number; width: number; height: number };

export function groundRect(nw: GroundPoint | null, se: GroundPoint | null): GroundBounds | null {
  if (!nw || !se) return null;
  if (![nw.lat, nw.lon, se.lat, se.lon].every(Number.isFinite)) return null;
  return {
    west: Math.min(nw.lon, se.lon),
    east: Math.max(nw.lon, se.lon),
    south: Math.min(nw.lat, se.lat),
    north: Math.max(nw.lat, se.lat),
  };
}

/** Width/height of the supplied bounds. Degrees are not converted to metres. */
export function selectionAspect(bounds: GroundBounds): number | null {
  const width = Math.abs(bounds.east - bounds.west);
  const height = Math.abs(bounds.north - bounds.south);
  if (width === 0 || height === 0) return null;
  return width / height;
}

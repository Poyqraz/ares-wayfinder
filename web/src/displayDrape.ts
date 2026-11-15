/** Display-only drape. Mesh vertices stay on the DEM; the route engine is not involved. */
export interface DisplayDrape {
  textureUrl: string;
  sourceNote: string;
}

/** Use a validated drape when one is present. Otherwise keep the verified CTX texture URL. */
export function displayTextureUrl(drape: DisplayDrape | null, fallback: string): string {
  if (!drape) return fallback;
  const url = drape.textureUrl.trim();
  return url || fallback;
}

import { expect, type Page } from "@playwright/test";

const GEO_TOL_DEG = 1e-9;

type LoadedPoi = {
  id: string;
  name: string;
  geo?: { lat?: number; lon?: number };
  evidence?: {
    coordinate_source?: {
      status?: string;
      kind?: string;
      printed?: { lat?: number; lon?: number; elev_m?: number | null };
      convention?: { elevation_reference?: string };
    };
    target_location?: { precision?: string };
    ctx_registration?: { status?: string };
    vertical_datum?: { status?: string };
    role?: { kind?: string; text?: string; validated_habitat?: boolean };
  } | null;
};

type CardExpect = {
  coordinate: "VERIFIED" | "UNVERIFIED";
  coordinateLabel: string;
  targetPrecision: "EXACT" | "APPROXIMATE" | "UNKNOWN";
  targetLabel: string;
  registrationLabel: string;
  datumLabel: string;
  roleLabel: string | null;
  elevationLabel: string | null;
};

const LEGACY: CardExpect = {
  coordinate: "UNVERIFIED",
  coordinateLabel: "Coordinates UNVERIFIED (no evidence record)",
  targetPrecision: "UNKNOWN",
  targetLabel: "Target location: precision unknown",
  registrationLabel: "CTX DEM/image registration UNRESOLVED (S-4)",
  datumLabel: "Vertical datum UNVERIFIED",
  roleLabel: null,
  elevationLabel: null,
};

/** Test oracle. Reads the evidence record itself and does not call the UI status functions. */
function expectFromEvidence(poi: LoadedPoi): CardExpect {
  const evidence = poi.evidence;
  if (evidence == null) return LEGACY;
  const source = evidence.coordinate_source;
  const printedLat = source?.printed?.lat;
  const printedLon = source?.printed?.lon;
  const matches = typeof poi.geo?.lat === "number" && typeof poi.geo.lon === "number"
    && typeof printedLat === "number" && typeof printedLon === "number"
    && Math.abs(poi.geo.lat - printedLat) <= GEO_TOL_DEG
    && Math.abs(poi.geo.lon - printedLon) <= GEO_TOL_DEG;
  const verified = source?.status === "VERIFIED" && matches;
  const what = source?.kind === "pds_rover_position"
    ? "PDS rover position"
    : source?.kind === "pds_landing_site"
      ? "PDS landing-site position"
      : "Source position";
  const precision = evidence.target_location?.precision;
  const targetPrecision = precision === "EXACT" || precision === "APPROXIMATE" || precision === "UNKNOWN" ? precision : "UNKNOWN";
  const elev = source?.printed?.elev_m;
  const who = source?.kind === "pds_rover_position" ? "PDS rover" : source?.kind === "pds_landing_site" ? "PDS landing-site" : "Source";
  const ref = source?.convention?.elevation_reference === "areoid" ? "areoid" : "reference unknown";
  return {
    coordinate: verified ? "VERIFIED" : "UNVERIFIED",
    coordinateLabel: verified ? `Coordinates: ${what} VERIFIED` : "Coordinates UNVERIFIED",
    targetPrecision,
    targetLabel: targetPrecision === "EXACT"
      ? "Target location: exact as defined"
      : targetPrecision === "APPROXIMATE"
        ? "Target location: APPROXIMATE (rover position during the activity, not the rock itself)"
        : "Target location: precision unknown",
    registrationLabel: evidence.ctx_registration?.status === "UNRESOLVED"
      ? "CTX DEM/image registration UNRESOLVED (S-4)"
      : "CTX DEM/image registration verified",
    datumLabel: evidence.vertical_datum?.status === "UNVERIFIED" ? "Vertical datum UNVERIFIED" : "Vertical datum verified",
    roleLabel: typeof evidence.role?.text === "string" ? evidence.role.text : null,
    elevationLabel: typeof elev === "number"
      ? `${who} elevation ${elev.toFixed(3)} m (${ref}, as printed in the source; not used for routing)`
      : null,
  };
}

export async function loadedPois(page: Page): Promise<LoadedPoi[]> {
  const index = await (await page.request.get("/data/index.json")).json() as { roi_a: { path: string } };
  const body = await (await page.request.get(`/${index.roi_a.path}pois.json`)).json();
  if (!Array.isArray(body)) throw new Error("pois.json is not a list");
  return body as LoadedPoi[];
}

export function uncertaintyText(pois: readonly LoadedPoi[]): string {
  const cards = pois.map(expectFromEvidence);
  const verified = cards.filter((card) => card.coordinate === "VERIFIED").length;
  const summary = verified === 0
    ? "POI coordinates UNVERIFIED"
    : `POI coordinates: ${verified} PDS-verified rover/landing positions${cards.some((card) => card.targetPrecision === "APPROXIMATE") ? "; targets APPROXIMATE" : ""}`;
  return `${summary}. Vertical datum is the DEM model height. Horizontal distances stay in metres. No measured EVA time or surface hazard is shown. Minetti costs stay as model limits only.`;
}

/** Map badges follow the loaded evidence. Catalogue badges are a second copy and are not counted here. */
export async function expectMapBadges(page: Page, pois: readonly LoadedPoi[]): Promise<void> {
  const cards = pois.map(expectFromEvidence);
  await expect(page.locator(".poi-layer").getByTestId("poi-pds-verified")).toHaveCount(cards.filter((card) => card.coordinate === "VERIFIED").length);
  await expect(page.locator(".poi-layer").getByTestId("poi-target-approx")).toHaveCount(cards.filter((card) => card.targetPrecision === "APPROXIMATE").length);
  await expect(page.locator(".poi-layer").getByTestId("poi-unverified")).toHaveCount(cards.filter((card) => card.coordinate === "UNVERIFIED").length);
}

export async function expectSelectedCard(page: Page, poi: LoadedPoi): Promise<void> {
  const card = expectFromEvidence(poi);
  if (poi.id === "landing" && poi.evidence?.role) {
    if (poi.evidence.role.validated_habitat !== false) throw new Error("landing validated_habitat must be false");
    expect(poi.evidence.role.text ?? "").toContain("not a validated astronaut habitat");
  }
  await expect(page.getByTestId("poi-coord-status")).toHaveText(card.coordinateLabel);
  await expect(page.getByTestId("poi-target-precision")).toHaveText(card.targetLabel);
  await expect(page.getByTestId("poi-registration")).toHaveText(card.registrationLabel);
  await expect(page.getByTestId("poi-datum")).toHaveText(card.datumLabel);
  if (card.roleLabel) await expect(page.getByTestId("poi-role")).toHaveText(card.roleLabel);
  else await expect(page.getByTestId("poi-role")).toHaveCount(0);
  if (card.elevationLabel) await expect(page.getByTestId("poi-elevation")).toHaveText(card.elevationLabel);
  else await expect(page.getByTestId("poi-elevation")).toHaveCount(0);
}

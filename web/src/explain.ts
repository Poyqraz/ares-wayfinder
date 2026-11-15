import type { CostComparison } from "@ares/core";

/** |Δ horizontal length| at or under this is shown as equal length (handoff T08). */
export const LENGTH_EQUAL_M = 1e-6;

export const MODEL_DISCLAIMER =
  "Model cost is not distance, energy, time or safety; the curve comes from Earth, unsuited treadmill data (Minetti et al. 2002) and is not validated for suited Mars EVA.";

export const EQUAL_LOWER_FRAMING =
  `Both routes are the same physical length. The terrain-aware route has the lowest model cost among them. ${MODEL_DISCLAIMER}`;

export function lengthsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= LENGTH_EQUAL_M;
}

export function formatMetres(n: number, digits: number): string {
  return n.toFixed(digits);
}

export function whyThisRoute(
  equalLength: boolean,
  relation: CostComparison["relation"] | null,
  lengthDeltaM: number | null,
): string {
  if (relation === null) {
    return `No model comparison is available for these endpoints. ${MODEL_DISCLAIMER}`;
  }
  switch (relation) {
    case "LOWER":
      if (equalLength) return EQUAL_LOWER_FRAMING;
      return lengthDeltaM === null
        ? `The terrain-aware route is longer and has the lower model cost of the two. ${MODEL_DISCLAIMER}`
        : `The terrain-aware route is ${formatMetres(lengthDeltaM, 1)} m longer and has the lower model cost of the two. ${MODEL_DISCLAIMER}`;
    case "EQUAL":
      return `${equalLength ? "Both routes are the same physical length" : "Horizontal lengths differ"}, and the model costs match within tolerance. ${MODEL_DISCLAIMER}`;
    case "BASELINE_NOT_ALLOWED":
      return `The shortest-distance path uses an edge the terrain model excludes (|grade| above the demonstration limit). ${MODEL_DISCLAIMER}`;
    default: {
      const unreachable: never = relation;
      return unreachable;
    }
  }
}

export function relationSentence(relation: CostComparison["relation"]): string {
  switch (relation) {
    case "LOWER":
      return "LOWER: the terrain-aware route has a lower model cost than the shortest-distance route scored with the same curve.";
    case "EQUAL":
      return "EQUAL: the model costs match within the comparison tolerance.";
    case "BASELINE_NOT_ALLOWED":
      return "BASELINE_NOT_ALLOWED: the shortest-distance route uses an edge this terrain model excludes, so it has no model cost.";
    default: {
      const unreachable: never = relation;
      return unreachable;
    }
  }
}

/** Planetocentric latitude, east-positive longitude, displayed with a hemisphere letter. */
export function formatGeo(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}

export type DestinationStatus = "loading" | "unavailable" | "nodata" | "out-of-coverage" | "integrity" | "ready";

export type DestinationFields = {
  coordinate?: string | null;
  areaName?: string | null;
  elevationM?: number | null;
  elevationSource?: string | null;
  coverage?: string | null;
  precision?: string | null;
  slope?: string | null;
  science?: string | null;
  routingAvailable?: boolean;
  routingReason?: string | null;
};

export type CardLine = { label: string; value: string };

export function destinationMessage(status: DestinationStatus): string | null {
  switch (status) {
    case "loading":
      return "Loading destination information.";
    case "unavailable":
      return "Destination information is unavailable.";
    case "nodata":
      return "NoData at this location. Elevation is not supplied.";
    case "out-of-coverage":
      return "This location is outside the supplied data coverage.";
    case "integrity":
      return "Destination data failed an integrity check.";
    case "ready":
      return null;
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

/** Shows only values the caller supplied. Missing fields stay marked as not supplied. */
export function readyLines(fields: DestinationFields): CardLine[] {
  const lines: CardLine[] = [
    { label: "Coordinate", value: fields.coordinate ?? "Coordinate not supplied." },
    { label: "Region context", value: fields.areaName ?? "Not supplied." },
    {
      label: "Elevation",
      value: fields.elevationM == null
        ? "Elevation not supplied."
        : `${fields.elevationM} m${fields.elevationSource ? ` (${fields.elevationSource})` : ""}`,
    },
    { label: "Coverage", value: fields.coverage ?? "Coverage not supplied." },
    { label: "Precision", value: fields.precision ?? "Precision not supplied." },
  ];
  if (fields.slope) lines.push({ label: "Slope", value: fields.slope });
  if (fields.science) lines.push({ label: "Science", value: fields.science });
  lines.push({
    label: "Routing",
    value: fields.routingReason ?? (fields.routingAvailable ? "Routing available." : "Routing is not available."),
  });
  return lines;
}

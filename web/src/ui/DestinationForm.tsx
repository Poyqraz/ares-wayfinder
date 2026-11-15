import { useState } from "react";

// Presentational only (MAP-LAYERS-AND-UI-CONTRACT.md §5): the text goes to the shared
// core parser through onSubmit; the parser's error is shown verbatim. No local validation.
export function DestinationForm({ onSubmit, error }: { onSubmit: (text: string) => void; error: string | null }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  return (
    <form
      className="ui-form"
      data-testid="destination-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(`${lat.trim()}, ${lon.trim()}`);
      }}
    >
      <label>
        Planetocentric latitude (°N)
        <input
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "coordinate-error" : undefined}
          value={lat}
          onChange={(event) => setLat(event.target.value)}
          data-testid="lat-input"
        />
      </label>
      <label>
        East-positive longitude (°E)
        <input
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "coordinate-error" : undefined}
          value={lon}
          onChange={(event) => setLon(event.target.value)}
          data-testid="lon-input"
        />
      </label>
      {error ? <p id="coordinate-error" role="alert" data-testid="coordinate-error">{error}</p> : null}
      <button type="submit">Select destination</button>
    </form>
  );
}

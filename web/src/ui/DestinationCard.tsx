import { destinationMessage, readyLines, type DestinationFields, type DestinationStatus } from "./cardModel.ts";

// Compact: the essentials up front, everything else one click away.
const PRIMARY = new Set(["Coordinate", "Elevation", "Routing"]);

export function DestinationCard({
  open,
  status,
  fields,
  onDismiss,
}: {
  open: boolean;
  status: DestinationStatus;
  fields: DestinationFields;
  onDismiss: () => void;
}) {
  if (!open) return null;
  const message = destinationMessage(status);
  return (
    <aside className="ui-card" data-testid="destination-card">
      <div className="ui-card-head">
        <h2>Destination</h2>
        <button type="button" onClick={onDismiss} data-testid="dismiss-card">Dismiss</button>
      </div>
      {message ? <p data-testid="card-message">{message}</p> : (
        <>
          <dl>
            {readyLines(fields).filter((line) => PRIMARY.has(line.label)).map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
          <details data-testid="card-details">
            <summary>Sources, coverage and precision</summary>
            <dl>
              {readyLines(fields).filter((line) => !PRIMARY.has(line.label)).map((line) => (
                <div key={line.label}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </aside>
  );
}

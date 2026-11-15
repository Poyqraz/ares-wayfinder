# CR-004 — Optional POI evidence record (canonical schema)

| | |
|---|---|
| Status | **APPROVED IN PRINCIPLE** (technical lead, 2026-11-14) as a backward-compatible, optional extension. **Not yet applied** to any live bundle. The live dataset migration needs the frontend status display plus your explicit approval of the combined release. |
| Applies to | `pois.json` in the CTX bundles (`Poi[]`, contract v1.0.0 §2). |
| Reference implementation | `pipeline/poi_evidence.py` (`validate_evidence`, `display_status`), tested by `pipeline/tests/test_poi_evidence.py`. The frontend must reproduce `display_status` exactly. |
| Proposed data | `science/s2_release/pois.v2.proposed.json` (valid against this schema). |
| Contract | **Added now** (technical lead, 2026-11-14): `contracts/types.ts` defines `PoiEvidence` and the optional `Poi.evidence`; `contracts/CONTRACT.md` §5 records CR-004 as additive. Every v1.0.0 field keeps its name, type and meaning. `CONTRACT_VERSION` stays `"1.0.0"` until the release decides on `1.1.0`, because loaders compare it strictly with each bundle's `contract_version`. The frontend imports `PoiEvidence` from `@ares/contracts` and defines no copy of its own. |

## 1. Schema (`schema: "ares-poi-evidence/1"`)

```ts
interface Poi {                       // contract v1.0.0 fields, unchanged
  id: string; name: string; geo: GeoPoint; claim: string; source: string;
  confidence: "high" | "medium" | "low";
  evidence?: PoiEvidence;             // CR-004, optional
}
interface PoiEvidence {
  schema: "ares-poi-evidence/1";
  coordinate_source: {                // where the coordinate comes from and whether it is verified
    status: "VERIFIED" | "UNVERIFIED";
    kind: "pds_rover_position" | "pds_landing_site" | "publication" | "other";
    product: string;                  // PDS LID / product (e.g. "urn:nasa:pds:mars2020_sample_dossier, Initial Report M2020-190-3 …")
    locator: string;                  // file + row/page (e.g. "initial_reports_volume1.pdf pp. 36, 59")
    url: string;
    printed: { lat: number; lon: number; elev_m: number | null };   // exactly as printed in the source
    convention: { latitude: "planetocentric"; longitude: "east_positive"; lon_domain: "-180..180";
                  elevation_reference: "areoid" | "unknown" };
    cross_checks: { source: string; url?: string; delta_m: number }[];
  };
  target_location: {                  // precision of the scientific target, separate from the coordinate's source
    precision: "EXACT" | "APPROXIMATE" | "UNKNOWN";
    basis: string;
  };
  ctx_registration: { status: "VERIFIED" | "UNRESOLVED"; ref: string; note?: string };   // S-4
  vertical_datum:   { status: "VERIFIED" | "UNVERIFIED" };
  role: { kind: "historical_landing_reference" | "sampling_site" | "other";
          validated_habitat: false;   // constant: no POI is a validated astronaut habitat
          text: string };
  science?: { geology?: string; samples?: { name: string; number: number; sol_cored?: number; sol_sealed?: number; note?: string }[];
              events?: string; references?: string[] };                 // provenance text, not a status
}
```

Required: everything above except `science`, `cross_checks[].url` and `ctx_registration.note`.
Extra unknown fields are ignored.

## 2. Rules

1. **Statuses come only from `evidence`.** `confidence` is a legacy summary and never yields VERIFIED,
   even when it is `"high"`.
2. **Coordinate source and target precision are separate.** A sample site can have a VERIFIED PDS rover
   position and an APPROXIMATE rock location at the same time.
3. **One source of truth for the coordinate.** `coordinate_source` is shown as VERIFIED only if
   `|geo.lat − printed.lat| ≤ 1e-9°` and `|geo.lon − printed.lon| ≤ 1e-9°`. Otherwise the coordinate is
   shown UNVERIFIED with the notice
   `"geo does not match the cited source coordinates; showing UNVERIFIED"`.
4. **Invalid or unknown evidence** (wrong `schema`, missing field, bad enum, `validated_habitat !== false`)
   is shown with the legacy statuses plus the notice
   `"POI evidence record invalid; showing legacy statuses"`. This is a display downgrade, not a bundle
   integrity failure: `pois.json` is already covered by the manifest SHA-256, so routing is unaffected.
5. **Legacy POI (no `evidence`)** shows all four legacy statuses below. Existing v1.0.0 `pois.json` stays
   fully valid.
6. **S-4 and the vertical datum** are also shown globally (map/3D notes). Per-POI labels never replace
   those global notes.

## 3. Exact display labels (from `display_status`)

| Field | Value | Label |
|---|---|---|
| coordinate | VERIFIED, kind `pds_rover_position` | `Coordinates: PDS rover position VERIFIED` |
| coordinate | VERIFIED, kind `pds_landing_site` | `Coordinates: PDS landing-site position VERIFIED` |
| coordinate | UNVERIFIED (or mismatch) | `Coordinates UNVERIFIED` |
| coordinate | legacy (no evidence) | `Coordinates UNVERIFIED (no evidence record)` |
| target | EXACT | `Target location: exact as defined` |
| target | APPROXIMATE | `Target location: APPROXIMATE (rover position during the activity, not the rock itself)` |
| target | UNKNOWN / legacy | `Target location: precision unknown` |
| registration | UNRESOLVED / legacy | `CTX DEM/image registration UNRESOLVED (S-4)` |
| datum | UNVERIFIED / legacy | `Vertical datum UNVERIFIED` |
| role | from `role.text` | e.g. `Historical Perseverance landing site, used as a hypothetical mission reference point; not a validated astronaut habitat.` (legacy: none) |
| elevation | `printed.elev_m` present | `PDS rover elevation -2574.553 m (areoid, as printed in the source; not used for routing)` (`PDS landing-site elevation …` for the landing site; legacy or `null`: none). Shown only as provenance on the POI card, never in the elevation profile, the numbers panel, the HUD or next to DEM heights. |

Compact map badges (mapping only; the full labels appear on the POI card):
- coordinate VERIFIED → `PDS POSITION ✓`;
- target APPROXIMATE → `TARGET APPROX.`;
- coordinate UNVERIFIED or legacy → `UNVERIFIED`.

Badges are never derived from `confidence`.

## 4. Values in the proposed release (`pois.v2.proposed.json`)

| id | coordinate | kind | target | registration | datum | role | `geo` = PDS printed |
|---|---|---|---|---|---|---|---|
| landing | VERIFIED | pds_landing_site (PLACES best_interp SITE 1) | APPROXIMATE (PDS landing-site localization; 3.6 m between PLACES versions) | UNRESOLVED (S-4) | UNVERIFIED | historical_landing_reference; not a validated astronaut habitat | 18.444627146, 77.450885729 |
| roubion | VERIFIED | pds_rover_position (IR M2020-164-2) | APPROXIMATE | UNRESOLVED | UNVERIFIED | sampling_site (#2, atmosphere) | 18.42769340, 77.45165066 |
| rochette | VERIFIED | pds_rover_position (IR M2020-190-3 / 196-4) | APPROXIMATE | UNRESOLVED | UNVERIFIED | sampling_site (#3, #4) | 18.43074132, 77.44436502 |
| sid | VERIFIED | pds_rover_position (IR M2020-371-9 / 374-10) | APPROXIMATE (2.6 m pose difference noted) | UNRESOLVED | UNVERIFIED | sampling_site (#9, #10) | 18.44386406, 77.45242176 |

`confidence` = `"medium"` for all four. It is informational only.

## 5. Compatibility (tested)

| Frontend \ Data | Current release (CTX `fc22a0c8a91f` / `5ee3aeb913b6`, HiRISE `e88cfab318e6`) | Candidate release (CTX `7ec72147790e` / `05fddbe4d280`, HiRISE `376dcb1220c4`; old folders kept) |
|---|---|---|
| **H3** (`feat/hirise-display` @ `336dccc`, unchanged) | web 28/28 (measured); passing state as released | **Not releasable.** e2e 11/12: the POI `UNVERIFIED` badges silently drop 4 → 0 (keyed on `confidence === "low"`). Web unit 27/28 (`hirise.test.ts` pins `fc22a0c8a91f`). Core parity fails on H3's stale golden, as the SRC-2 guard intends. HiRISE layer: realigned, loads. |
| **CR-004 frontend** (to build) | must show legacy labels (§3): `Coordinates UNVERIFIED (no evidence record)`, etc. | must show the §4 statuses; required for release |
| HiRISE alignment | old HiRISE + new CTX → rejected (`not aligned to loaded CTX`) → CTX fallback (verified by the loader check) | new HiRISE + old CTX → rejected → CTX fallback |

## 6. Test requirements

Data side (done, `feat/data-core`):
- t04 release gate: `t04_bundle.py` refuses to bundle a `pois.json` with CR bytes, missing v1.0.0 fields, duplicate ids, an invalid evidence record or `geo` ≠ `printed` (`bundle_problems`), before anything is staged.
- `test_poi_evidence.py`: the proposed v2 is valid; legacy renders UNVERIFIED; `confidence: high`
  without evidence stays UNVERIFIED; bad enum, `validated_habitat: true`, a 6 m `geo` mismatch and an
  unknown schema all fall back safely.

Frontend side (Cursor):
1. Golden table: for the 4 v2 POIs and the 4 legacy POIs, the rendered labels equal `display_status`
   (fixture generated from `pipeline/poi_evidence.py`).
2. `confidence: "high"` without evidence → `UNVERIFIED` badge.
3. Invalid evidence → legacy labels plus notice; routes and numbers unchanged.
4. `geo` ≠ `printed` → `Coordinates UNVERIFIED` plus notice.
5. Landing card shows the role text with "not a validated astronaut habitat".
6. The global S-4 and vertical-datum notes stay visible in 2D and 3D in both data versions.
7. No test or loader hard-codes a dataset version; read `index.json`.
8. e2e passes against both the current and the candidate data.

## 7. Rollback

Data rollback = point `index.json` back to the previous immutable folders (kept). Contract rollback =
drop the optional field. Both are additive and need no history rewrite.

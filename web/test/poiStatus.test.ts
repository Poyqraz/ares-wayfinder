import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Poi } from "@ares/contracts";
import { displayStatus, poiBadges } from "../src/poiStatus.ts";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

describe("POI evidence status", () => {
  it("matches every golden display_status case", () => {
    const file = JSON.parse(readFileSync(join(fixtures, "cr004_display_fixture.json"), "utf8")) as {
      cases: { case: string; poi: Poi; expected: ReturnType<typeof displayStatus> }[];
    };
    for (const item of file.cases) {
      assert.deepEqual(displayStatus(item.poi), item.expected, item.case);
    }
  });

  it("does not treat confidence high without evidence as verified", () => {
    const poi: Poi = {
      id: "bare",
      name: "Bare",
      geo: { lat: 1, lon: 2 },
      claim: "claim",
      source: "https://example.test",
      confidence: "high",
    };
    const status = displayStatus(poi);
    assert.equal(status.coordinate, "UNVERIFIED");
    assert.equal(status.coordinate_label, "Coordinates UNVERIFIED (no evidence record)");
    assert.deepEqual(poiBadges(status), [{ text: "UNVERIFIED", testId: "poi-unverified" }]);
  });

  it("renders the proposed S2 points as verified positions with approximate targets", () => {
    const pois = JSON.parse(readFileSync(join(fixtures, "pois.v2.proposed.json"), "utf8")) as Poi[];
    const fixture = JSON.parse(readFileSync(join(fixtures, "cr004_display_fixture.json"), "utf8")) as {
      cases: { case: string; expected: ReturnType<typeof displayStatus> }[];
    };
    assert.equal(pois.length, 4);
    const badges = pois.flatMap((poi) => poiBadges(displayStatus(poi)));
    assert.equal(badges.filter((badge) => badge.text === "PDS POSITION ✓").length, 4);
    assert.equal(badges.filter((badge) => badge.text === "TARGET APPROX.").length, 4);
    const landing = pois.find((poi) => poi.id === "landing");
    assert.ok(landing);
    const landingStatus = displayStatus(landing);
    assert.match(landingStatus.role_label ?? "", /not a validated astronaut habitat/);
    assert.equal(landingStatus.registration_label, "CTX DEM/image registration UNRESOLVED (S-4)");
    assert.equal(landingStatus.datum_label, "Vertical datum UNVERIFIED");
    for (const poi of pois) {
      const expected = fixture.cases.find((item) => item.case === `v2:${poi.id}`)?.expected;
      assert.ok(expected);
      assert.deepEqual(displayStatus(poi), expected);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EQUAL_LOWER_FRAMING, lengthsEqual, whyThisRoute } from "../src/explain.ts";

const BANNED = [/\bsafe\b/i, /\bsafest\b/i, /EVA-certified/i, /\bETA\b/, /\bminutes\b/i, /\boxygen\b/i, /energy saved/i, /obstacle-free/i, /NASA-approved/i];

describe("route framing", () => {
  it("uses the required wording when the paths are equal and the terrain model is lower", () => {
    assert.equal(
      whyThisRoute(true, "LOWER", null),
      "Both routes are the same physical length. The terrain-aware route has the lowest model cost among them. Model cost is not distance, energy, time or safety; the curve comes from Earth, unsuited treadmill data (Minetti et al. 2002) and is not validated for suited Mars EVA.",
    );
    assert.equal(whyThisRoute(true, "LOWER", null), EQUAL_LOWER_FRAMING);
  });

  it("does not claim equal length after the endpoints change", () => {
    const text = whyThisRoute(false, "LOWER", null);
    assert.equal(text.includes("Both routes are the same physical length."), false);
    assert.equal(text.includes("lower model cost"), true);
  });

  it("states how much longer the terrain-aware route is when lengths differ", () => {
    const text = whyThisRoute(false, "LOWER", 12.34);
    assert.equal(text.includes("12.3 m longer"), true);
    assert.equal(text.includes("not validated for suited Mars EVA"), true);
    assert.equal(text.includes("do not share"), false);
  });

  it("treats 1e-6 m as equal and the next step as different", () => {
    assert.equal(lengthsEqual(0, 1e-6), true);
    assert.equal(lengthsEqual(0, 1e-6 + 1e-9), false);
  });

  it("keeps banned claims out of the framing", () => {
    for (const relation of ["LOWER", "EQUAL", "BASELINE_NOT_ALLOWED"] as const) {
      for (const equal of [true, false]) {
        const text = whyThisRoute(equal, relation, null);
        for (const pattern of BANNED) assert.equal(pattern.test(text), false, `${pattern} in ${text}`);
      }
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayTextureUrl } from "../src/displayDrape.ts";

describe("display drape", () => {
  it("keeps the verified texture unless a drape URL is present", () => {
    const fallback = "/data/roi_a/ortho.jpg";
    assert.equal(displayTextureUrl(null, fallback), fallback);
    assert.equal(displayTextureUrl({ textureUrl: "  ", sourceNote: "empty" }, fallback), fallback);
    assert.equal(
      displayTextureUrl({ textureUrl: "/display/hires.jpg", sourceNote: "validated display only" }, fallback),
      "/display/hires.jpg",
    );
  });
});

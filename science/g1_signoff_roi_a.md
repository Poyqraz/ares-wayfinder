# G1 sign-off record — ROI-A

Decision (technical lead, 2026-11-14): **CONDITIONAL G1 APPROVAL FOR ENGINEERING PROGRESS, NOT FINAL SCIENTIFIC SIGN-OFF.**
G1 is **not passed**. Nothing merges to `main` on the strength of this record.

| Sign-off | Status | Evidence |
|---|---|---|
| S-1 Source authenticity | Verified (metadata) | PDS4 labels: `urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxdem_mosaic` v1.0 and `...:m20_ctxortho_mosaic` v1.0 — `science/sources.json` |
| S-2 Geometric intersection | Verified | Header-derived window cols 1232–1306, rows 2484–2574 (GDAL + TS tests) |
| S-3 Valid-pixel coverage | **PASS** (automatic) | `roi_validation_roi_a.md`: 6660/6660 routable, all 4 marker cells valid |
| S-4 DEM↔ortho registration | **Visually plausible, quantitatively unverified** | Lead review of `g1_overlay_roi_a.png`: broadly aligned, no doubled rims seen. Area-based NCC check (`registration_roi_a.md`) is **inconclusive**: global NCC 0.084, flat correlation surfaces, 3 of 5 peaks on the ±50 m search edge. This neither confirms 20 m consistency nor shows misregistration; ortho brightness appears albedo-dominated (unverified). No offset is claimed. |
| S-5 Plausible elevation/slope | Plausible (lead review) | h −2589…−2546 m; slope max 8.1°; DEM vs TRN within ~1 m at 4 points |
| S-6 Provenance labels | Labels consistent (lead review); product IDs verified | `sources.json` |
| S2 Marker coordinates | **OPEN** | `pois.json` entries are confidence "low" until checked against primary sources |

Engineering may proceed with T05, T06 and T04 because none of them depends on the DEM↔ortho registration
claim: routing uses only the DEM. The ortho remains a display layer.

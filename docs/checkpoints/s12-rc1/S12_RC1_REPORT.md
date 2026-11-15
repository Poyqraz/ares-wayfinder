# s12-rc1: EVA ground surface, Mars Cinematic View, and S11 acceptance polish

Branch `integ/s12`, base and rollback checkpoint `s11-rc1` (f6b9844). No dataset, catalog, contract, planner, gate,
route or measurement change; reference routes unchanged (ROI-A 969.161 m / 1058.299, M0-A 416.426 m / 664.390).
Not merged, not pushed.

## A. EVA HUD near-ground surface (`web/src/atmosphere.tsx`, `web/src/EvaView3D.tsx`)
The ground near the walker was a magnified 1 m image: smooth and uniform. Two changes, both in the fragment shader of
the terrain material only (geometry, elevations, texture and its mapping are untouched):
- **Local contrast from the ortho itself** (unsharp mask over neighbouring texels) within about 70 m, strongest close in.
  It brings out detail the HiRISE image already holds where it is stretched. Nothing is added.
- **Fine grain below the image's resolution**: world-anchored brightness noise at about 1 cm, 2.5 cm, 8 cm, 25 cm and
  0.8 m, typically within 8 % of the image brightness. Each size fades out at the distance where it would fall under
  about two pixels, so it does not shimmer, and all of it is gone within a few tens of metres. It has no shapes, casts
  nothing, is not tiled, and does not change the surface: it is brightness only. It is not data, and the HUD says so.
- Texture filtering was already at the maximum anisotropy the GPU offers; the blur was magnification, not mip choice.
- A precision bug found on the way: the first noise hash broke at scene coordinates times the grain frequency; the cell
  index is now wrapped before hashing.

## B. Mars Cinematic View and Scientific View
- **Mars Cinematic View** (EVA and 3D Terrain): a dusty sky that is lighter at the horizon and darker overhead, distance
  haze scaled to the grid, a slight warm tint on the terrain image, and the near-ground treatment above (EVA only).
  Restrained on purpose: the terrain image keeps its contrast and the route stays readable.
- **Scientific View**: exactly the previous rendering. The stored image, no sky, haze, tint or grain.
- A toggle sits in the EVA HUD and in the 3D Terrain panel, with a line saying the treatment is visual only. The app
  starts in Cinematic View when WebGL runs on a GPU and in Scientific View on a software renderer, where the shader is
  too slow. 2D maps, analytical layers, Regional Relief and every readout are untouched; a test checks the EVA readouts
  and camera are identical in both styles.

## C. S11 acceptance points
1. **Clicking markers in the 3D canvas**: now tested by clicking the canvas itself at the marker's screen position
   (landing zone, Bright Angel, F02): the right card opens and the camera centres on it. The first run failed for the
   landing-zone flag: the click target was effectively the thin pole. Each marker now has an invisible, larger click
   target around its head.
2. **x1 / x3 in Regional Relief** keeps the selected marker, its card and the camera's view: target and camera move
   together to the marker's new height.
3. **Sidebar**: the selected card stays in view while the catalogue scrolls under it; the catalogue is six collapsible
   groups (all open), with the ten depot drops under their own sub-heading. Nothing was removed.
Also: the EVA visor keeps a workable height on short screens (the rows under it scroll), and the browser suites now
run with six workers; with twelve, software-rendered tests starved each other and timing checks failed at random.

## Verification (on the committed code)
- Unit 90/90, build OK.
- Browser (Chromium): dev 39/39, production preview with DNS disabled 39/39 (2 new tests).
- Real Chrome on NVIDIA RTX 4060: perf suite 7/7; EVA 144 fps in Cinematic View at 1440 x 900.
- core 41/41, pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.
- Looked at in the real browser at 1440 x 900 and 1024 x 768.

## Pictures (real Chrome, GPU)
- `s12-app-1-eva-{early,mid,destination}-before-scientific.png` and `-after-cinematic.png`: the same positions at true
  vertical scale, before and after.
- `s12-app-2-eva-mid-cinematic-x3.png`, `s12-app-4-eva-1024-cinematic.png`.
- `s12-app-01-3d-cinematic.png`, `s12-app-02-3d-scientific.png`.
- `s12-app-3-relief-1440-*.png`, `s12-app-4-relief-1024-card.png`; headless shots `s12-01` to `s12-08`.

## Remaining issues
- The near ground is still a 1 m image under the grain: the treatment adds texture, not information.
- ROI-A (CTX 5 m image on a 20 m DEM) gains grain and haze but has little image detail to sharpen.
- The EVA visor at 1024 x 768 is workable but tight.
- Software-rendered browsers start in Scientific View; Cinematic View can be switched on there but is slow.
- Carried over: all scientific limitations and open reviews.

## Recommendation
GO for final human acceptance.

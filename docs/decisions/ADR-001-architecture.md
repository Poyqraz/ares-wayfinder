# ADR-001: Static-first, dual-language verified core

Status: accepted (2026-11-14, technical lead)

## Decision

- Python (`pipeline/`, uv + rasterio) prepares and validates one ROI once, and writes a versioned
  static terrain bundle (Float32 `.bin` + `terrain.json` + JPEG ortho).
- TypeScript `core/` holds coordinate transforms and routing (A* + Dijkstra) and runs in the browser.
- Python also holds an independently written reference Dijkstra (SciPy) that produces golden
  fixtures. TypeScript A* must match them (parity test X1).
- React + React Three Fiber + zustand frontend (`web/`). 2D map is SVG/canvas, no map library.
- No live API or service. The demo runs fully offline.

## Why

ROI-A is about 74×90 cells, so routing in the browser is instant. There is no service to fail.
Two implementations in two languages give a real independent oracle. The engineering and visual
streams own disjoint files.

## Fallback

If parity X1 is not passing by 2026-11-14 18:00: Python precomputes routes for chosen start/goal
pairs and the POI-to-POI matrix as JSON, and the UI only displays them.

## Rejected

Unreal/ROS (separate runtime, no web UI), CesiumJS (ion token and Mars ellipsoid setup),
MapLibre/deck.gl (Web Mercator / lon-lat assumptions), MMGIS install (too heavy for one ROI).

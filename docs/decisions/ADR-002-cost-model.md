# ADR-002: Terrain cost model and how its numbers may be presented

Status: accepted for the prototype (2026-11-14); curve coefficients pending science task S6.

## Two different quantities — never mix them in the UI

| Quantity | Field | Unit | Meaning |
|---|---|---|---|
| Route length | `length_horizontal_m`, `length_surface_m` | metres | Physical length of the path on the 20 m DEM grid. |
| Terrain cost | `cost_flat_equiv_m` | flat-ground-equivalent metres | Σ (horizontal step length × m(grade)). A **model output**, not a distance, not energy, not time. |

`m(g)` is a dimensionless relative multiplier with `m(0) = 1`. Because `m < 1` on gentle downhill
grades, `cost_flat_equiv_m` **can be smaller than the physical length** (ROI-A, Landing → Roubion:
cost 904.7 vs length 1016.6 m). The UI must say so whenever both numbers are shown, e.g.
"Terrain cost (model): 905 flat-equivalent m — lower than the 1017 m path because it runs mostly downhill."

## The Minetti curve is an unvalidated EVA approximation

`m(g) = C(g)/C(0)` with `C(i) = 280.5i⁵ − 58.7i⁴ − 76.8i³ + 51.9i² + 19.6i + 2.5` (Minetti et al. 2002,
J Appl Physiol 93:1039). Coefficients recalled from secondary sources; **verification pending (S6)**.

What the source measured: unsuited runners on a treadmill on Earth (1 g), gradients −0.45…+0.45.
What it cannot support: spacesuits, Mars gravity (0.38 g), loads, loose regolith, rocks, absolute energy,
O₂ or time. Only the *shape* of the curve is used. Required UI wording:
"Relative terrain cost. Curve shape from Earth unsuited treadmill data (Minetti et al. 2002); not validated for suited Mars EVA."

Tobler (1993) is offered as an alternative shape (`m = v(0)/v(g)`), with the same caveats.

## Grade limit

Edges with `|g| > 0.45` are removed in terrain mode: that is the edge of the curve's measured domain,
not a safety limit. UI label: "demonstration parameter, not a safety limit".

## A* lower bound (audited)

Heuristic = anisotropic octile ground distance × `m_min`, where `m_min` = min of m over
[−g_max, g_max] (dense sampling) × (1 − 1e−3). Since every edge costs ≥ `m_min` × its horizontal length,
and octile is the shortest 8-connected length on an empty grid, the bound holds **including downhill
edges with cost < length**. Audit: `core/test/heuristic.test.ts` checks h(goal) = 0 and
h(u) ≤ c(u,v) + h(v) on every edge of the real ROI-A grid (distance, Minetti, Tobler), and h ≤ the
Dijkstra optimum from 40 starts. Assuming `m_min = 1` with these curves would be inadmissible.

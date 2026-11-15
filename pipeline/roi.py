"""Pure ROI helpers (contracts/CONTRACT.md §1-2). No network, no files."""
import math

import numpy as np
from affine import Affine

VALID, NODATA_SOURCE, OUTSIDE_ROI, VALID_SLOPE_UNDEFINED = 0, 1, 2, 3


def window_from_proj_bounds(t: Affine, xmin, xmax, ymin, ymax):
    """Contract window rounding: expand the projected box to whole source pixels.

    Returns (col0, col1, row0, row1) with col1/row1 exclusive, plus the window's
    top-left corner (x0, y0), which is always a real source pixel corner.
    """
    inv = ~t
    c_a, r_a = inv @ (xmin, ymax)  # north-west corner
    c_b, r_b = inv @ (xmax, ymin)  # south-east corner
    col0, col1 = math.floor(min(c_a, c_b)), math.ceil(max(c_a, c_b))
    row0, row1 = math.floor(min(r_a, r_b)), math.ceil(max(r_a, r_b))
    x0, y0 = t.c + col0 * t.a, t.f + row0 * t.e  # exact for north-up grids, no matrix float noise
    return col0, col1, row0, row1, x0, y0


def ground_dx(dx_proj, lat_center_deg, lat_ts_deg):
    """East-west ground spacing in metres; the only place cos(lat) is applied."""
    return dx_proj * math.cos(math.radians(lat_center_deg)) / math.cos(math.radians(lat_ts_deg))


def horn_slope_deg(z, dx, dy):
    """Horn 3x3 slope in degrees. z carries a 1-cell halo; output is z[1:-1, 1:-1].

    Any NaN in the 3x3 neighbourhood gives NaN. The 8 neighbours propagate NaN through
    the sums; the centre cell is not in the Horn kernel, so it is masked explicitly.
    """
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, e, f = z[1:-1, :-2], z[1:-1, 1:-1], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dy)
    s = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    s[np.isnan(e)] = np.nan
    return s


def validity(dem, slope):
    """Contract validity codes for the ROI grid (no OUTSIDE_ROI cells inside a rectangle)."""
    v = np.full(dem.shape, VALID, dtype=np.uint8)
    v[np.isnan(slope)] = VALID_SLOPE_UNDEFINED
    v[np.isnan(dem)] = NODATA_SOURCE
    return v

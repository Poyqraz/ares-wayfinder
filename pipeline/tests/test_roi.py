import math

import numpy as np
from affine import Affine
from rasterio.crs import CRS
from rasterio.warp import transform as gdal_transform

from roi import (
    NODATA_SOURCE,
    VALID,
    VALID_SLOPE_UNDEFINED,
    ground_dx,
    horn_slope_deg,
    validity,
    window_from_proj_bounds,
)

DEM_T = Affine(20, 0, 4329000, 0, -20, 1143420)
EQC = CRS.from_proj4("+proj=eqc +lat_ts=18.4663 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs")
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")


def test_roi_a_window_matches_contract_rounding():
    xs, ys = gdal_transform(GEO, EQC, [77.436, 77.462], [18.422, 18.452])
    col0, col1, row0, row1, x0, y0 = window_from_proj_bounds(DEM_T, min(xs), max(xs), min(ys), max(ys))
    assert (col0, col1, row0, row1) == (1232, 1306, 2484, 2574)
    assert (x0, y0) == (4329000 + 1232 * 20, 1143420 - 2484 * 20)


def test_ground_dx_is_identity_at_true_scale_and_corrects_lat_ts_zero():
    assert math.isclose(ground_dx(20, 18.4663, 18.4663), 20)
    assert math.isclose(ground_dx(20, 18.44, 0), 20 * math.cos(math.radians(18.44)))


def _halo_grid(ny, nx, f, dx, dy):
    rows, cols = np.mgrid[0 : ny + 2, 0 : nx + 2]
    return f(cols * dx, -rows * dy).astype(float)  # north-up: y decreases with row


def test_horn_flat_is_zero():
    z = np.full((7, 9), -2500.0)
    assert np.all(horn_slope_deg(z, 20, 20) == 0)


def test_horn_tilted_plane_with_anisotropic_spacing():
    a, b, dx, dy = 0.1, -0.2, 19.0, 20.0
    z = _halo_grid(5, 6, lambda x, y: a * x + b * y, dx, dy)
    expected = math.degrees(math.atan(math.hypot(a, b)))
    s = horn_slope_deg(z, dx, dy)
    assert s.shape == (5, 6)
    assert np.allclose(s, expected, atol=1e-9)


def test_nan_spreads_only_to_its_3x3_neighbourhood_and_sets_validity():
    z = np.zeros((9, 9))
    z[4, 4] = np.nan
    dem = z[1:-1, 1:-1]
    s = horn_slope_deg(z, 20, 20)
    assert np.isnan(s).sum() == 9  # the hole plus its 8 neighbours
    v = validity(dem, s)
    assert v[3, 3] == NODATA_SOURCE
    assert (v == VALID_SLOPE_UNDEFINED).sum() == 8
    assert (v == VALID).sum() == 49 - 9

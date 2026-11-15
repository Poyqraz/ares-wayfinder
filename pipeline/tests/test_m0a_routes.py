import math

import numpy as np

import oracle
from m0a_bundle import block_mean
from m0a_routes import edges, shortest


def test_vectorised_graph_matches_the_loop_oracle_on_random_grids_with_nodata():
    rng = np.random.default_rng(3)
    for _ in range(40):
        ny, nx = int(rng.integers(4, 9)), int(rng.integers(4, 9))
        dem = rng.random((ny, nx)) * 6
        val = np.where(rng.random((ny, nx)) < 0.2, 1, 0).astype(np.uint8)
        free = np.argwhere(val == 0)
        if len(free) < 2:
            continue
        a, b = (tuple(int(v) for v in free[rng.integers(len(free))]) for _ in range(2))
        if a == b:
            continue
        for mode, curve in (("distance", "minetti"), ("terrain", "minetti"), ("terrain", "tobler")):
            ref = oracle.route_cost(dem, val, np.zeros_like(dem), 1.897, 2.0, a, b, mode, curve, 0.45, None)
            got, path = shortest(edges(dem, val == 0, 1.897, 2.0, mode, curve, 0.45), a[0] * nx + a[1], b[0] * nx + b[1], nx)
            assert (ref is None) == (got is None)
            if ref is not None:
                assert math.isclose(ref, got, rel_tol=1e-12)
                assert path[0] == a and path[-1] == b and all(val[r, c] == 0 for r, c in path)


def test_block_mean_marks_any_nodata_block_as_nodata():
    a = np.arange(16, dtype=float).reshape(4, 4)
    a[0, 0] = np.nan
    m = block_mean(a, 2)
    assert np.isnan(m[0, 0]) and m[1, 1] == np.mean([10, 11, 14, 15])

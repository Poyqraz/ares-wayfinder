import numpy as np

from m0a_g3g4 import best_shift, block_mean


def surface(x, y):
    return 30 * np.sin(x / 37.0) * np.cos(y / 53.0) + 0.02 * x * y / 100


def test_best_shift_recovers_a_known_offset_and_ignores_vertical_bias():
    yy, xx = np.mgrid[0:120, 0:150] * 2.0
    ref = surface(xx, yy)
    true = (8.0, -12.0)  # the other surface sees each feature 8 m east, 12 m south... evaluated at ref + shift
    other = lambda sx, sy: surface(xx + sx - true[0], yy - (sy - true[1])) + 5.0  # +5 m bias must not matter
    _, best = best_shift(ref, other, np.arange(-20, 21, 4))
    assert best == true


def test_block_mean_averages_whole_blocks_and_drops_the_remainder():
    a = np.arange(30, dtype=float).reshape(5, 6)
    assert block_mean(a, 2).tolist() == [[3.5, 5.5, 7.5], [15.5, 17.5, 19.5]]

from m0a_validate import corridor_mask, verdict


def test_corridor_follows_the_segment_with_anisotropic_cells():
    m = corridor_mask((5, 9), (2, 0), (2, 8), 1.0, 1.0)
    assert m[2].all() and m[1].all() and m[3].all()  # within one cell of the row
    assert not m[0].any() and not m[4].any()
    # half width of 2 cells in x, 0.5 in y: a vertical segment widens only sideways
    v = corridor_mask((6, 7), (0, 3), (5, 3), 2.0, 0.5)
    assert v[:, 1:6].all() and not v[:, 0].any() and not v[:, 6].any()


def test_verdict_names_every_failed_condition():
    assert verdict(True, 1.0, True, True, 1e-9) == ("PASS", [])
    status, problems = verdict(False, 0.9, False, False, 1.0)
    assert status == "FAIL" and len(problems) == 5

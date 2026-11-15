import sys, numpy as np
z = np.load(sys.argv[1] + "/dtm_roi.npy").astype(np.float64)[2:-2, 2:-2]
d1 = np.diff(z, axis=0)                       # N-S first difference
B = 100; hits = []; steps = []
for c0 in range(0, z.shape[1] - B + 1, B):
    seg = np.median(d1[:, c0:c0 + B], axis=1) # coherent step per row across a 100 m segment
    base = seg - np.convolve(seg, np.ones(15) / 15, mode="same")
    sig = 1.4826 * np.median(np.abs(base - np.median(base)))
    out = np.where(np.abs(base) > max(6 * sig, 0.05))[0]
    hits += [(int(r), c0) for r in out]; steps += np.abs(base[out]).tolist()
rows = sorted({r for r, _ in hits})
print("segments with a coherent row step > max(6 sigma, 5 cm):", len(hits), "| distinct rows:", len(rows))
if steps: print("step size median %.2f m, max %.2f m" % (np.median(steps), np.max(steps)))
# cluster rows (lines) and report spacing
lines = [rows[0]] if rows else []
for r in rows[1:]:
    if r - lines[-1] > 3: lines.append(r)
print("line rows (clustered):", lines[:30], "count", len(lines))

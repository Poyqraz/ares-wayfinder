import io, gzip, json, sys
import numpy as np
from PIL import Image
D = sys.argv[1]
z = np.load(f"{D}/dtm_roi.npy")[2:-2, 2:-2].astype(np.float32); img = np.load(f"{D}/ortho_roi.npy")
def agg(a, f):
    h, w = a.shape[0] // f * f, a.shape[1] // f * f
    return a[:h, :w].reshape(h // f, f, w // f, f).mean(axis=(1, 3))
def jpg(a, q):
    b = io.BytesIO(); Image.fromarray(a).save(b, "JPEG", quality=q, optimize=True); return b.tell()
print("DTM 1 m crop", z.shape, "verts", z.size, "raw MB %.1f gzip MB %.1f" % (z.nbytes / 1e6, len(gzip.compress(z.tobytes(), 6)) / 1e6))
for f in (2, 4):
    a = agg(z.astype(np.float64), f).astype(np.float32)
    print(f"DTM {f} m block-mean", a.shape, "verts", a.size, "tris", 2 * (a.shape[0] - 1) * (a.shape[1] - 1), "raw MB %.1f gzip MB %.1f" % (a.nbytes / 1e6, len(gzip.compress(a.tobytes(), 6)) / 1e6))
print("ortho 0.25 m", img.shape, "JPEG q85 MB %.1f" % (jpg(img, 85) / 1e6), "(WebGL needs <= 8192 px per side on many GPUs)")
for f in (2, 4):
    a = agg(img.astype(np.float64), f).round().astype(np.uint8)
    print(f"ortho {0.25*f} m", a.shape, "JPEG q85 MB %.1f" % (jpg(a, 85) / 1e6))

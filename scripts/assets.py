"""Asset pipeline: palette (k-means snapped to real pixels), premultiplied resize, favicon trace.
   python scripts/assets.py          -> regenerate src/tokens.css, assets/*
   python scripts/assets.py --verify -> check every hex in tokens.css against the pixel it cites
"""
import sys, re, struct, pathlib
import numpy as np
from PIL import Image
from scipy.cluster.vq import kmeans2
from skimage import measure

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO = ROOT / "brand" / "LOGO GOPAD PNG...png"             # RGBA, colortype 6
LOGO_RGB = ROOT / "brand" / "LOGO GOPAD PNG.png"           # RGB, colortype 2, opaque black ground
BANNER = ROOT / "reference" / "SAMPUL GOPAD JPG.jpg.jpeg"  # RGB JPEG 1500x500
TOKENS = ROOT / "src" / "tokens.css"


def hexof(t):
    return "#%02x%02x%02x" % tuple(int(v) for v in t)


def kmeans(px, k, seed=7):
    c, l = kmeans2(px.astype(float), k, minit="++", seed=seed, iter=40)
    return c, l


def snap(arr, centroid):
    """nearest REAL pixel to a centroid -> ((x, y), (r, g, b))"""
    w = arr.shape[1]
    flat = arr[..., :3].reshape(-1, 3).astype(float)
    i = int(((flat - centroid) ** 2).sum(1).argmin())
    return (i % w, i // w), tuple(int(v) for v in flat[i])


def read_ihdr(path):
    b = pathlib.Path(path).read_bytes()
    w, h, bd, ct, _, _, il = struct.unpack(">IIBBBBB", b[16:29])
    return dict(w=w, h=h, bitdepth=bd, colortype=ct, interlace=il)


def build_palette():
    L = np.array(Image.open(LOGO))
    B = np.array(Image.open(BANNER))
    out = []
    opaque = L[L[..., 3] == 255][:, :3]
    c, l = kmeans(opaque, 3)
    big = int(np.bincount(l).argmax())
    xy, rgb = snap(L, c[big])
    out.append(("lime", "logo", xy, rgb, "k-means k=3 on opaque logo pixels, largest cluster"))
    c, l = kmeans(B[::3, ::3].reshape(-1, 3), 8)
    cs = {i: snap(B, c[i]) for i in range(8)}
    order = sorted(range(8), key=lambda i: c[i].sum())
    roles = {"void": order[0], "slate": order[1], "snow": order[-1]}
    blue = sorted(order[2:-1], key=lambda i: (c[i][2] - c[i][0]), reverse=True)
    roles["sky-deep"], roles["sky-mid"], roles["sky-pale"], roles["haze"] = blue[0], blue[1], blue[2], blue[3]
    for role, i in roles.items():
        xy, rgb = cs[i]
        out.append((role, "banner", xy, rgb, "k-means k=8 (every 3rd px), cluster %d, n=%d" % (i, int((l == i).sum()))))
    reg = B[120:190, 630:870].reshape(-1, 3)
    j = int(reg.sum(1).argmax())
    ry, rx = divmod(j, 240)
    out.append(("ink", "banner", (630 + rx, 120 + ry), tuple(int(v) for v in reg[j]),
                "brightest pixel inside wordmark box x630-870 y120-190"))
    return out


def write_tokens(pal):
    lines = [
        "/* tokens.css : the ONLY file allowed to hold colour literals (favicon.svg excepted, gate-checked against this file).",
        "   Provenance: every hex below is a real pixel of a brand file. k-means centroids are snapped to the nearest actual",
        "   pixel; the cited (x,y) is that pixel. `python scripts/assets.py --verify` re-reads each one. Nothing here is invented. */",
        ":root {",
    ]
    for role, src, xy, rgb, how in pal:
        f = "brand/LOGO GOPAD PNG...png" if src == "logo" else "reference/SAMPUL GOPAD JPG.jpg.jpeg"
        lines.append("  --c-%s: %s; /* %s @ x=%d,y=%d ; %s */" % (role, hexof(rgb), f, xy[0], xy[1], how))
    lines += [
        "",
        "  /* layout + motion tokens (measured off the reference) */",
        "  --tap-min: 44px;",
        "  --ease: cubic-bezier(.4, 0, .2, 1);   /* reference default easing */",
        "  --t-fast: 150ms;                       /* reference default duration (buttons) */",
        "  --t-mid: 300ms;                        /* icon hover scale */",
        "  --t-slow: 500ms;                       /* glow fade */",
        "}",
        "",
    ]
    TOKENS.write_text("\n".join(lines), encoding="utf8")


def premult_resize(img, size):
    a = np.array(img.convert("RGBA")).astype(np.float32)
    al = a[..., 3:4] / 255.0
    pm = np.concatenate([a[..., :3] * al, a[..., 3:4]], axis=2)
    chans = [np.array(Image.fromarray(np.ascontiguousarray(pm[..., i]), "F").resize((size, size), Image.LANCZOS)) for i in range(4)]
    r = np.stack(chans, axis=2)
    alpha = np.clip(r[..., 3:4], 0, 255)
    rgb = np.where(alpha > 0.5, r[..., :3] / np.maximum(alpha / 255.0, 1e-6), 0)
    out = np.concatenate([np.clip(rgb, 0, 255), alpha], axis=2).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trace_favicon(lime):
    L = np.array(Image.open(LOGO))
    al = L[..., 3].astype(float) / 255.0
    ys, xs = np.where(al > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    scale = (32 - 2 * 3.0) / side
    cs = measure.find_contours(np.pad(al, 1), 0.5)
    cs.sort(key=len, reverse=True)
    paths = []
    for c in cs[:4]:
        if len(c) < 200:
            continue
        c = measure.approximate_polygon(c, tolerance=2.2)
        pts = [((p[1] - 1 - cx) * scale + 16, (p[0] - 1 - cy) * scale + 16) for p in c]
        paths.append("M" + " L".join("%.2f %.2f" % p for p in pts[:-1]) + "Z")
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
           '<!-- traced from the alpha grid of brand/LOGO GOPAD PNG...png (2000x2000): contour at alpha 0.5, simplified, scaled into 32x32; fill equals --c-lime in src/tokens.css -->'
           '<path fill="%s" fill-rule="evenodd" d="%s"/></svg>\n' % (lime, " ".join(paths)))
    (ROOT / "assets" / "favicon.svg").write_text(svg, encoding="utf8")
    return len(paths), sum(len(p.split("L")) for p in paths)


def verify():
    txt = TOKENS.read_text(encoding="utf8")
    imgs = {"brand/LOGO GOPAD PNG...png": np.array(Image.open(LOGO)),
            "reference/SAMPUL GOPAD JPG.jpg.jpeg": np.array(Image.open(BANNER))}
    bad = 0
    n = 0
    for m in re.finditer(r"--c-([\w-]+):\s*(#[0-9a-fA-F]{6});\s*/\*\s*(\S.*?)\s@\sx=(\d+),y=(\d+)", txt):
        n += 1
        role, hx, f, x, y = m.group(1), m.group(2).lower(), m.group(3), int(m.group(4)), int(m.group(5))
        px = imgs[f][y, x]
        if hexof(px[:3]) != hx:
            print("MISMATCH", role, hx, "file pixel", hexof(px[:3]))
            bad += 1
    fav = (ROOT / "assets" / "favicon.svg").read_text(encoding="utf8")
    fh = re.search(r'fill="(#[0-9a-fA-F]{6})"', fav).group(1).lower()
    if not re.search(r"--c-lime:\s*%s" % fh, txt):
        print("favicon fill not in tokens")
        bad += 1
    print("verified %d token pixels, %d bad" % (n, bad))
    sys.exit(1 if bad or n == 0 else 0)


def main():
    if "--verify" in sys.argv:
        verify()
    for p in (LOGO, LOGO_RGB):
        print("IHDR", p.name, read_ihdr(p))
    pal = build_palette()
    for r in pal:
        print(r[0].ljust(9), hexof(r[3]), r[1], "xy=%s" % (r[2],), r[4])
    write_tokens(pal)
    lime = hexof([p for p in pal if p[0] == "lime"][0][3])
    print("favicon subpaths/points:", trace_favicon(lime))
    logo = Image.open(LOGO)
    for size in (160, 512):
        premult_resize(logo, size).save(ROOT / "assets" / ("logo-%d.png" % size), optimize=True)
    r = np.array(Image.open(ROOT / "assets" / "logo-512.png")).astype(int)
    part = r[(r[..., 3] > 10) & (r[..., 3] < 245)][:, :3]
    print("logo-512 partial-alpha px:", len(part), "mean RGB", part.mean(0).round(1), "min G", part[:, 1].min())
    B = Image.open(BANNER).convert("RGB")
    B.crop((0, 215, 1500, 500)).save(ROOT / "assets" / "mountains.jpg", quality=86, optimize=True, progressive=True)
    B.save(ROOT / "assets" / "banner.jpg", quality=86, optimize=True, progressive=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reproducible woff2 subsetting. See README.md. Usage: .venv/bin/python build.py [--check]"""
import hashlib, io, json, sys, urllib.request, zipfile
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
spec = json.loads((HERE / "fonts.spec.json").read_text())
out_dir = (HERE / spec["outputDir"]).resolve()


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def parse_ranges(s):
    cps = set()
    for part in s.split(","):
        part = part.strip().replace("U+", "")
        lo, _, hi = part.partition("-")
        cps.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return cps


def ksx1001_hangul():
    cps = set()
    for cp in range(0xAC00, 0xD7A4):
        try:
            b = chr(cp).encode("euc-kr")
        except UnicodeEncodeError:
            continue
        # Python's euc-kr is CP949 (UHC); keep only strict KS X 1001 (lead 0xB0-0xC8, trail 0xA1-0xFE)
        if len(b) == 2 and 0xB0 <= b[0] <= 0xC8 and b[1] >= 0xA1:
            cps.add(cp)
    assert len(cps) == 2350, len(cps)
    return cps


def fetch(font):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / font["archiveName"]
    if not path.exists():
        print("downloading", font["url"])
        with urllib.request.urlopen(font["url"]) as r:
            path.write_bytes(r.read())
    data = path.read_bytes()
    if sha256(data) != font["archiveSha256"]:
        sys.exit(f"SHA-256 mismatch for {path.name}: got {sha256(data)}")
    return data


def build(font):
    with zipfile.ZipFile(io.BytesIO(fetch(font))) as z:
        ttf = z.read(font["member"])
    cps = set()
    for r in font["ranges"]:
        cps |= parse_ranges(spec["ranges"][r])
    if font["ksx1001Hangul"]:
        cps |= ksx1001_hangul()
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    opts.hinting = False
    f = TTFont(io.BytesIO(ttf), recalcTimestamp=False)
    s = subset.Subsetter(opts)
    s.populate(unicodes=sorted(cps))
    s.subset(f)
    f.flavor = "woff2"
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()


def main():
    check = "--check" in sys.argv
    hashes = {}
    for font in spec["fonts"]:
        data = build(font)
        hashes[font["output"]] = {"sha256": sha256(data), "bytes": len(data)}
        if not check:
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / font["output"]).write_bytes(data)
        print(font["output"], len(data), sha256(data))
    if not check:
        (HERE / "hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")


main()

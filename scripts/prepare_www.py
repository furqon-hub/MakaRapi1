"""
MakaRapi — Skrip Kemas Aset Frontend ke folder www/ untuk Build Capacitor Android (.apk)
Jalankan: python scripts/prepare_www.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "www"

FILES_TO_COPY = [
    "home.html",
    "index.html",
    "manifest.webmanifest",
    "sw.js",
]

DIRS_TO_COPY = [
    "css",
    "js",
    "icons",
]


def main() -> None:
    if WWW.exists():
        shutil.rmtree(WWW)
    WWW.mkdir(parents=True, exist_ok=True)

    for rel in FILES_TO_COPY:
        src = ROOT / rel
        if src.is_file():
            shutil.copy2(src, WWW / rel)

    for rel_dir in DIRS_TO_COPY:
        src_dir = ROOT / rel_dir
        if src_dir.is_dir():
            shutil.copytree(src_dir, WWW / rel_dir)

    # Buat entry point index_app.html / pastikan home.html tersedia;
    # Di Capacitor, start page default adalah index.html, sedangkan user ingin halaman awal home.html ->
    # biarkan home.html & index.html utuh agar navigasi dua arah tetap identik.
    print(f"Aset frontend MakaRapi berhasil dikemas ke: {WWW}")


if __name__ == "__main__":
    main()

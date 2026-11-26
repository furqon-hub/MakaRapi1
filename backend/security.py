"""
MakaRapi — Modul Hardening Keamanan OWASP (API & Upload Validation)
Mencakup:
1. OWASP Security Headers Middleware (anti-MIME sniffing, clickjacking, referrer, no-store API).
2. Sliding-Window Rate Limiter per IP untuk melindungi endpoint API dari penyalahgunaan / DoS.
3. Validasi berkas unggahan ketat: batas ukuran, magic bytes, dan proteksi ZIP Bomb / Path Traversal pada .docx.
4. Konfigurasi CORS terukur (localhost dev + env MAKARAPI_ALLOWED_ORIGINS untuk produksi HTTPS).
"""

from __future__ import annotations

import io
import os
import time
import zipfile
from collections import defaultdict, deque
from typing import Deque, Dict, List, Tuple

from fastapi import HTTPException

MAX_DOCX_UPLOAD_BYTES = 15 * 1024 * 1024       # 15 MB
MAX_GUIDELINE_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_ZIP_ENTRIES = 250
MAX_ZIP_UNCOMPRESSED_BYTES = 60 * 1024 * 1024  # 60 MB
MAX_ZIP_COMPRESSION_RATIO = 100.0

SECURITY_HEADERS: Dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


def get_allowed_cors_origins() -> List[str]:
    """Kembalikan daftar origin CORS terpercaya (dev lokal + env produksi)."""
    defaults = [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
        "http://localhost",
        "capacitor://localhost",
        "https://localhost",
    ]
    vercel_url = os.environ.get("VERCEL_URL", "").strip()
    if vercel_url:
        v_origin = vercel_url if vercel_url.startswith("http") else f"https://{vercel_url}"
        if v_origin not in defaults:
            defaults.append(v_origin)
    extra_raw = os.environ.get("MAKARAPI_ALLOWED_ORIGINS", "").strip()
    if extra_raw:
        for item in extra_raw.split(","):
            origin = item.strip().rstrip("/")
            if origin and origin not in defaults:
                defaults.append(origin)
    return defaults


class SlidingWindowRateLimiter:
    """Rate limiter in-memory ringan berbasis jendela waktu geser per (IP, bucket)."""

    def __init__(self, max_requests: int = 120, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str, now: float | None = None) -> Tuple[bool, int, int]:
        """
        Periksa apakah permintaan diizinkan.
        Mengembalikan (allowed, remaining, retry_after_seconds).
        """
        ts = time.monotonic() if now is None else now
        q = self._hits[key]
        cutoff = ts - self.window_seconds
        while q and q[0] <= cutoff:
            q.popleft()

        if len(q) >= self.max_requests:
            retry_after = max(1, int(self.window_seconds - (ts - q[0])) + 1)
            return False, 0, retry_after

        q.append(ts)
        remaining = max(0, self.max_requests - len(q))
        return True, remaining, 0

    def reset(self) -> None:
        self._hits.clear()


def validate_docx_zip_safety(raw: bytes, max_bytes: int = MAX_DOCX_UPLOAD_BYTES) -> None:
    """Validasi ukuran, magic bytes, anti-ZIP bomb, dan anti-path-traversal pada file .docx."""
    if not raw:
        raise HTTPException(status_code=400, detail="Berkas yang diunggah kosong.")
    if len(raw) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Ukuran berkas melebihi batas maksimum {mb} MB.")
    if not raw.startswith(b"PK\x03\x04"):
        raise HTTPException(
            status_code=400,
            detail="Berkas bukan dokumen Microsoft Word (.docx) yang valid (header ZIP tidak sesuai).",
        )

    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            infos = zf.infolist()
            if len(infos) > MAX_ZIP_ENTRIES:
                raise HTTPException(
                    status_code=400,
                    detail="Arsip .docx memiliki terlalu banyak entri internal dan ditolak demi keamanan.",
                )

            total_uncompressed = 0
            total_compressed = 0
            has_word_doc = False

            for info in infos:
                name = info.filename or ""
                if name.startswith("/") or name.startswith("\\") or ".." in name.replace("\\", "/").split("/"):
                    raise HTTPException(
                        status_code=400,
                        detail="Terdeteksi jalur tidak aman (path traversal) di dalam arsip .docx.",
                    )
                if name.lower() == "word/document.xml":
                    has_word_doc = True

                total_uncompressed += max(0, info.file_size)
                total_compressed += max(1, info.compress_size)

                if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail="Ukuran isi terkompresi .docx melebihi batas aman (proteksi ZIP bomb).",
                    )

            ratio = total_uncompressed / max(1, total_compressed)
            if total_uncompressed > 2 * 1024 * 1024 and ratio > MAX_ZIP_COMPRESSION_RATIO:
                raise HTTPException(
                    status_code=400,
                    detail="Rasio kompresi arsip .docx tidak wajar dan ditolak demi keamanan.",
                )

            if not has_word_doc:
                raise HTTPException(
                    status_code=400,
                    detail="Berkas ZIP tidak memiliki word/document.xml yang valid untuk dokumen .docx.",
                )
    except HTTPException:
        raise
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Struktur arsip .docx rusak atau tidak valid.") from exc


def validate_guideline_upload_safety(raw: bytes, file_name: str, max_bytes: int = MAX_GUIDELINE_UPLOAD_BYTES) -> None:
    """Validasi ukuran & magic bytes untuk file pedoman kampus (.pdf, .docx, .txt, .md)."""
    if not raw:
        raise HTTPException(status_code=400, detail="Berkas pedoman kosong.")
    if len(raw) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Ukuran berkas pedoman melebihi batas maksimum {mb} MB.")

    low = (file_name or "").lower()
    if low.endswith(".docx"):
        validate_docx_zip_safety(raw, max_bytes=max_bytes)
    elif low.endswith(".pdf"):
        if not raw[:16].lstrip().startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Header berkas PDF tidak valid.")
    elif not (low.endswith(".txt") or low.endswith(".md")):
        raise HTTPException(
            status_code=400,
            detail="Format pedoman tidak didukung. Gunakan .pdf, .docx, .txt, atau .md.",
        )

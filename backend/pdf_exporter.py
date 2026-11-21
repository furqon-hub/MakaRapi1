"""
MakaRapi — Konverter PDF Native via LibreOffice Headless (Opsional)
Mengonversi hasil .docx menjadi PDF yang 100% identik dengan tata letak Word
apabila LibreOffice (soffice) terpasang di mesin/server.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

WINDOWS_SOFFICE_CANDIDATES = [
    Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
    Path(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"),
]


def find_soffice_executable() -> Optional[str]:
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    for cand in WINDOWS_SOFFICE_CANDIDATES:
        if cand.is_file():
            return str(cand)
    return None


def convert_docx_bytes_to_pdf(docx_bytes: bytes, timeout_sec: int = 45) -> bytes:
    soffice = find_soffice_executable()
    if not soffice:
        raise RuntimeError("LibreOffice (soffice) tidak ditemukan di sistem.")

    with tempfile.TemporaryDirectory(prefix="makarapi_pdf_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        in_docx = tmp_path / "document.docx"
        out_pdf = tmp_path / "document.pdf"
        in_docx.write_bytes(docx_bytes)

        cmd = [
            soffice,
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            str(tmp_path),
            str(in_docx),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec)
        if proc.returncode != 0 or not out_pdf.is_file():
            err = (proc.stderr or proc.stdout or "Konversi PDF gagal.").strip()
            raise RuntimeError(f"LibreOffice gagal mengonversi PDF: {err}")
        return out_pdf.read_bytes()

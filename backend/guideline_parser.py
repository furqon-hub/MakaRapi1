"""
MakaRapi — Ekstraktor Teks Berkas Pedoman Kampus (.pdf, .docx, .txt, .md)
Menggunakan pypdf untuk PDF dan python-docx untuk DOCX di sisi server.
"""

from __future__ import annotations

import io
from typing import Dict

from docx import Document
from pypdf import PdfReader


def extract_guideline_text(file_bytes: bytes, file_name: str) -> Dict[str, str]:
    ext = (file_name.rsplit(".", 1)[-1] if "." in file_name else "").lower()

    if ext in ("txt", "md"):
        text = file_bytes.decode("utf-8", errors="replace").strip()
        return {"name": file_name, "text": text, "engine": "python-text"}

    if ext == "docx":
        doc = Document(io.BytesIO(file_bytes))
        parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        for tbl in doc.tables:
            for row in tbl.rows:
                row_txt = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
                if row_txt:
                    parts.append(row_txt)
        return {"name": file_name, "text": "\n".join(parts).strip(), "engine": "python-docx"}

    if ext == "pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages[:80]:
            t = (page.extract_text() or "").strip()
            if t:
                pages.append(t)
        full_text = "\n\n".join(pages).strip()
        if len(full_text) < 20:
            raise ValueError("PDF pedoman tidak memiliki lapisan teks (kemungkinan hasil scan gambar).")
        return {"name": file_name, "text": full_text, "engine": "python-pypdf"}

    raise ValueError("Format berkas pedoman tidak didukung. Unggah .pdf, .docx, .txt, atau .md.")

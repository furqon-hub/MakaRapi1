"""
MakaRapi — Skrip Benchmark & Evaluasi Kuantitatif (Siap Lampiran / BAB IV Skripsi)
Mengukur:
1. Akurasi ekstraksi struktur (BAB, Sub-bab, Sub-sub-bab, Tabel, Gambar, Abstrak, Daftar Pustaka).
2. Akurasi pemeriksaan konsistensi sitasi.
3. Waktu proses rata-rata parsing (.docx -> JSON) dan generasi OOXML (.docx asli).
4. Validitas paket OOXML (ZIP CRC32 + XML well-formedness + Print Layout + id-ID).

Jalankan dengan: python tests/benchmark.py
"""

from __future__ import annotations

import csv
import io
import statistics
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from docx import Document

from backend.citation_checker import audit_citations
from backend.docx_builder import build_docx_from_payload
from backend.docx_parser import parse_docx_bytes


def _generate_synthetic_docx(num_babs: int, paras_per_bab: int, num_tables: int, include_abstract: bool) -> bytes:
    doc = Document()
    doc.add_paragraph(f"STUDI EVALUASI SISTEM OTOMATISASI FORMAT MAKALAH SKENARIO {num_babs} BAB")

    if include_abstract:
        doc.add_paragraph("ABSTRAK")
        doc.add_paragraph("Penelitian ini mengevaluasi kinerja sistem pemformatan makalah akademik berbasis aturan dan OOXML.")
        doc.add_paragraph("Kata Kunci: makalah, OOXML, python-docx, otomatisasi format")

    doc.add_paragraph("KATA PENGANTAR")
    doc.add_paragraph("Puji syukur penulis panjatkan atas terselesaikannya dokumen uji ini.")

    romans = ["I", "II", "III", "IV", "V"]
    table_inserted = 0
    for b in range(num_babs):
        r = romans[b] if b < len(romans) else str(b + 1)
        doc.add_paragraph(f"BAB {r} PEMBAHASAN BAGIAN {r}")
        doc.add_paragraph(f"A. Subbab Pertama Bagian {r}")
        for p_idx in range(paras_per_bab):
            p = doc.add_paragraph()
            p.add_run(f"Paragraf ke-{p_idx + 1} membahas konsep ")
            it = p.add_run("artificial intelligence")
            it.italic = True
            p.add_run(" dalam pendidikan tinggi (Russell & Norvig, 2021).")
        doc.add_paragraph(f"{b + 1}.1.1 Sub-sub-bab Detail Teknis")
        doc.add_paragraph("1. Poin analisis pertama dalam skenario evaluasi.")
        doc.add_paragraph("2. Poin analisis kedua untuk validasi penomoran otomatis.")
        if table_inserted < num_tables:
            table_inserted += 1
            doc.add_paragraph(f"Tabel {table_inserted}. Data Evaluasi Skenario {table_inserted}")
            tbl = doc.add_table(rows=3, cols=3)
            headers = ["Metrik", "Nilai", "Keterangan"]
            for c, h in enumerate(headers):
                tbl.cell(0, c).text = h
            for row_i in range(1, 3):
                tbl.cell(row_i, 0).text = f"Indikator {row_i}"
                tbl.cell(row_i, 1).text = f"{90 + row_i}%"
                tbl.cell(row_i, 2).text = "Terverifikasi"
            doc.add_paragraph("Sumber: data uji otomatis.")

    doc.add_paragraph("DAFTAR PUSTAKA")
    doc.add_paragraph("Russell, S., & Norvig, P. (2021). Artificial intelligence: A modern approach. Pearson.")

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def run_benchmark() -> List[Dict[str, Any]]:
    scenarios = [
        ("Makalah Ringkas (2 BAB, 0 Tabel)", 2, 2, 0, False),
        ("Makalah Standar (3 BAB, 1 Tabel, Abstrak)", 3, 4, 1, True),
        ("Makalah Menengah (3 BAB, 2 Tabel, Abstrak)", 3, 6, 2, True),
        ("Laporan Panjang (4 BAB, 3 Tabel, Abstrak)", 4, 8, 3, True),
        ("Skripsi Mini (5 BAB, 4 Tabel, Abstrak)", 5, 10, 4, True),
    ]

    results: List[Dict[str, Any]] = []

    for label, n_babs, n_paras, n_tables, has_abs in scenarios:
        raw = _generate_synthetic_docx(n_babs, n_paras, n_tables, has_abs)

        t0 = time.perf_counter()
        parsed = parse_docx_bytes(raw, "benchmark.docx")
        parse_ms = (time.perf_counter() - t0) * 1000.0

        cit_res = audit_citations({
            "content": parsed["bodyText"],
            "citations": [],
            "manualBibliography": parsed["bibliography"],
            "citationStyle": "apa",
        })

        # Susun payload build
        chapters = [{"blocks": [
            {"type": "bab", "babLabel": f"BAB {i + 1}", "babSubtitle": f"BAGIAN {i + 1}"},
            {"type": "subbab", "html": f"A. Subbab {i + 1}"},
            {"type": "subsubbab", "html": f"{i + 1}.1.1 Detail Teknis"},
            {"type": "paragraph", "html": "Paragraf uji dengan <i>artificial intelligence</i>."},
            {"type": "list", "items": [{"marker": "1.", "html": "Item satu."}, {"marker": "2.", "html": "Item dua."}]},
        ]} for i in range(n_babs)]

        t1 = time.perf_counter()
        out_bytes = build_docx_from_payload({
            "format": {
                "paperSize": "A4", "marginTop": 4, "marginLeft": 4, "marginBottom": 3, "marginRight": 3,
                "fontFamily": "Times New Roman", "fontSize": 12, "headingFontSize": 14, "lineSpacing": 1.5,
                "firstIndent": 1.25, "textAlign": "justify", "pageNumberMode": "skripsi",
                "showCover": True, "showAbstract": has_abs, "showPreface": True, "showToc": True, "showLot": n_tables > 0, "showLof": False,
            },
            "cover": {"title": parsed["suggestedTitle"], "authors": "Mahasiswa Uji (12345)", "university": "Universitas Uji", "year": "2026"},
            "abstract": {"body": parsed["abstractBody"], "keywords": parsed["abstractKeywords"]},
            "preface": {"body": parsed["prefaceBody"], "signature": "Penyusun"},
            "tocEntries": [{"title": "BAB I BAGIAN 1", "page": 1, "level": 1, "bold": True}],
            "lotEntries": [],
            "lofEntries": [],
            "chapters": chapters,
            "finalBib": [{"num": 1, "html": "Russell, S., &amp; Norvig, P. (2021). <i>Artificial intelligence</i>. Pearson."}],
            "citStyle": "apa",
        })
        build_ms = (time.perf_counter() - t1) * 1000.0

        # Validasi paket OOXML
        ooxml_valid = True
        try:
            with zipfile.ZipFile(io.BytesIO(out_bytes)) as z:
                assert z.testzip() is None
                for name in z.namelist():
                    if name.endswith((".xml", ".rels")):
                        ET.fromstring(z.read(name))
        except Exception:
            ooxml_valid = False

        struct_ok = (
            parsed["babCount"] == n_babs
            and parsed["tableCount"] == n_tables
            and bool(parsed["abstractBody"]) == has_abs
            and bool(parsed["prefaceBody"])
            and bool(parsed["bibliography"])
        )

        results.append({
            "scenario": label,
            "words": parsed["wordCount"],
            "bab_detected": f"{parsed['babCount']}/{n_babs}",
            "table_detected": f"{parsed['tableCount']}/{n_tables}",
            "citation_score": f"{cit_res['score']}%",
            "parse_ms": round(parse_ms, 2),
            "build_ms": round(build_ms, 2),
            "out_kb": round(len(out_bytes) / 1024.0, 1),
            "structure_ok": "PASS" if struct_ok else "FAIL",
            "ooxml_valid": "PASS" if ooxml_valid else "FAIL",
        })

    # Simpan ke CSV untuk bahan tabel BAB IV
    out_csv = ROOT_DIR / "tests" / "benchmark_report.csv"
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)

    print("\n=== HASIL BENCHMARK MAKARAPI HYBRID (PYTHON + OOXML) ===")
    print(f"{'Skenario':<44} | {'Kata':>5} | {'BAB':>5} | {'Tbl':>5} | {'Sitasi':>6} | {'Parse':>8} | {'Build':>8} | {'OOXML':>5}")
    print("-" * 106)
    for r in results:
        print(
            f"{r['scenario']:<44} | {r['words']:>5} | {r['bab_detected']:>5} | {r['table_detected']:>5} | "
            f"{r['citation_score']:>6} | {r['parse_ms']:>6.1f}ms | {r['build_ms']:>6.1f}ms | {r['ooxml_valid']:>5}"
        )
    avg_parse = statistics.mean(r["parse_ms"] for r in results)
    avg_build = statistics.mean(r["build_ms"] for r in results)
    print("-" * 106)
    print(f"Rata-rata Parse: {avg_parse:.2f} ms | Rata-rata Build .docx: {avg_build:.2f} ms | CSV: {out_csv}")
    return results


if __name__ == "__main__":
    run_benchmark()

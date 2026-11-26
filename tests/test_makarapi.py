"""
Suite Pengujian Otomatis MakaRapi Hybrid (Backend Python + OOXML .docx + Audit Sitasi)
Jalankan dengan: python -m unittest discover -s tests -v
"""

import io
import unittest
import warnings
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from docx import Document

from fastapi import HTTPException
from backend.academic_linter import lint_academic_text
from backend.citation_checker import audit_citations
from backend.database import (
    create_guideline_profile,
    delete_guideline_profile,
    init_db,
    list_guideline_profiles,
)
from backend.docx_builder import build_docx_from_payload
from backend.docx_parser import parse_docx_bytes
from backend.guideline_parser import extract_guideline_text
from backend.main import app, health_check
from backend.readiness_checker import audit_document_readiness
from backend.security import (
    SECURITY_HEADERS,
    SlidingWindowRateLimiter,
    validate_docx_zip_safety,
    validate_guideline_upload_safety,
)

W_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _make_sample_docx_bytes() -> bytes:
    """Buat dokumen .docx uji sintetis dengan italic istilah asing, tabel, Kata Pengantar, & Daftar Pustaka."""
    doc = Document()
    doc.add_paragraph("PEMANFAATAN KECERDASAN BUATAN DI PENDIDIKAN TINGGI")
    doc.add_paragraph("KATA PENGANTAR")
    doc.add_paragraph("Puji syukur penulis panjatkan atas terselesaikannya makalah ini.")

    doc.add_paragraph("BAB I PENDAHULUAN")
    doc.add_paragraph("A. Latar Belakang")
    p = doc.add_paragraph()
    p.add_run("Salah satu teknologi utama adalah kecerdasan buatan (")
    r_it = p.add_run("artificial intelligence")
    r_it.italic = True
    p.add_run(") yang banyak dikaji di perguruan tinggi (Russell & Norvig, 2021).")

    doc.add_paragraph("B. Rumusan Masalah")
    doc.add_paragraph("1. Bagaimana penerapan kecerdasan buatan di kampus?")
    doc.add_paragraph("2. Apa tantangan etika yang perlu diantisipasi?")

    doc.add_paragraph("BAB II PEMBAHASAN")
    doc.add_paragraph("A. Bentuk Pemanfaatan")
    doc.add_paragraph("Tabel 1. Ringkasan pemanfaatan AI di kampus")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.cell(0, 0).text = "Bidang"
    tbl.cell(0, 1).text = "Manfaat"
    tbl.cell(1, 0).text = "Pembelajaran"
    tbl.cell(1, 1).text = "Personalisasi materi"
    doc.add_paragraph("Sumber: olahan penulis.")

    doc.add_paragraph("DAFTAR PUSTAKA")
    bib = doc.add_paragraph()
    bib.add_run("Russell, S., & Norvig, P. (2021). ")
    r_bt = bib.add_run("Artificial intelligence: A modern approach")
    r_bt.italic = True
    bib.add_run(". Pearson.")

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class TestMakaRapiHybrid(unittest.TestCase):
    def test_health_endpoint(self):
        res = health_check()
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["engine"], "python-docx")

    def test_fastapi_routes_registered(self):
        paths = {r.path for r in app.routes}
        for required in (
            "/api/health",
            "/api/parse-docx",
            "/api/parse-guideline",
            "/api/audit-citations",
            "/api/audit-readiness",
            "/api/lint-academic",
            "/api/guidelines",
            "/api/guidelines/{profile_id}",
            "/api/export-docx",
            "/api/export-pdf",
        ):
            self.assertIn(required, paths)

    def test_parse_docx_structure_table_and_italics(self):
        raw = _make_sample_docx_bytes()
        parsed = parse_docx_bytes(raw, "uji_makalah.docx")

        self.assertEqual(parsed["suggestedTitle"], "PEMANFAATAN KECERDASAN BUATAN DI PENDIDIKAN TINGGI")
        self.assertIn("Puji syukur", parsed["prefaceBody"])
        self.assertEqual(parsed["babCount"], 2)
        self.assertEqual(parsed["tableCount"], 1)
        self.assertIn("<i>artificial intelligence</i>", parsed["bodyText"])
        self.assertIn("1. Bagaimana penerapan kecerdasan buatan di kampus?\n2. Apa tantangan etika yang perlu diantisipasi?", parsed["bodyText"])
        self.assertIn('[TABEL judul="Ringkasan pemanfaatan AI di kampus" sumber="olahan penulis."]', parsed["bodyText"])
        self.assertIn("<i>Artificial intelligence: A modern approach</i>", parsed["bibliography"])

    def test_build_docx_ooxml_validity_and_auto_numbering_roundtrip(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            out_bytes = build_docx_from_payload({
                "format": {
                    "paperSize": "A4", "marginTop": 4, "marginLeft": 4, "marginBottom": 3, "marginRight": 3,
                    "fontFamily": "Times New Roman", "fontSize": 12, "headingFontSize": 14, "lineSpacing": 1.5,
                    "firstIndent": 1.25, "spaceBefore": 6, "spaceAfter": 12, "applySpacingToHeadings": True,
                    "textAlign": "justify", "pageNumberMode": "skripsi",
                    "showCover": True, "showPreface": True, "showToc": True, "showLot": True, "showLof": False,
                },
                "cover": {"title": "UJI MAKALAH OTOMATIS", "year": "2026"},
                "preface": {"body": "Kata pengantar uji.", "signature": "Penyusun"},
                "tocEntries": [{"title": "BAB I PENDAHULUAN", "page": 1, "level": 1, "bold": True}],
                "lotEntries": [{"title": "Tabel 1.1. Ringkasan", "page": 1, "level": 1, "bold": False}],
                "chapters": [
                    {"blocks": [
                        {"type": "bab", "babLabel": "BAB I", "babSubtitle": "PENDAHULUAN"},
                        {"type": "subbab", "html": "A. Latar Belakang"},
                        {"type": "paragraph", "html": "Paragraf dengan <i>machine learning</i> dan sitasi."},
                        {"type": "subbab", "html": "B. Rumusan Masalah"},
                        {"type": "list", "items": [{"marker": "1.", "html": "Pertanyaan pertama?"}, {"marker": "2.", "html": "Pertanyaan kedua?"}]},
                        {"type": "table", "numberLabel": "Tabel 1.1", "title": "Ringkasan", "source": "Penulis", "rows": [["A", "B"], ["1", "2"]]},
                    ]},
                    {"blocks": [
                        {"type": "bab", "babLabel": "BAB II", "babSubtitle": "PEMBAHASAN"},
                        {"type": "subbab", "html": "A. Analisis"},
                    ]},
                ],
                "finalBib": [{"num": 1, "html": "Russell, S. (2021). <i>AI</i>. Pearson."}],
                "citStyle": "apa",
            })

        with zipfile.ZipFile(io.BytesIO(out_bytes)) as z:
            self.assertIsNone(z.testzip())
            for name in z.namelist():
                if name.endswith((".xml", ".rels")):
                    ET.fromstring(z.read(name))
            set_xml = z.read("word/settings.xml").decode("utf-8")
            sty_xml = z.read("word/styles.xml").decode("utf-8")
            doc_xml = z.read("word/document.xml").decode("utf-8")
            self.assertIn('w:val="print"', set_xml)
            self.assertIn('w:val="15"', set_xml)
            self.assertIn('w:val="id-ID"', sty_xml)
            self.assertIn('TOC \\o "1-3"', doc_xml)
            self.assertIn('w:before="120"', doc_xml)
            self.assertIn('w:after="240"', doc_xml)
            self.assertIn('w:before="120"', sty_xml)
            self.assertIn('w:after="240"', sty_xml)
            self.assertIn('SEQ Tabel', doc_xml)

        # Verifikasi round-trip penomoran otomatis Sub-bab & Daftar
        rt = parse_docx_bytes(out_bytes, "roundtrip.docx")
        self.assertIn("A. Latar Belakang", rt["bodyText"])
        self.assertIn("B. Rumusan Masalah", rt["bodyText"])
        self.assertIn("1. Pertanyaan pertama?", rt["bodyText"])
        self.assertIn("2. Pertanyaan kedua?", rt["bodyText"])
        self.assertIn("A. Analisis", rt["bodyText"])
        self.assertIn("<i>machine learning</i>", rt["bodyText"])

    def test_citation_checker_matched_missing_and_uncited(self):
        res = audit_citations({
            "content": (
                "Menurut studi terbaru (Russell & Norvig, 2021), AI berkembang pesat. "
                "Hal ini didukung pula oleh (Zawacki-Richter dkk., 2019) dan (Sugiyono, 2022)."
            ),
            "citations": [],
            "manualBibliography": (
                "Russell, S., & Norvig, P. (2021). Artificial intelligence. Pearson.\n"
                "Zawacki-Richter, O., et al. (2019). Systematic review of AI in higher education.\n"
                "UNESCO. (2023). Guidance for generative AI in education."
            ),
            "citationStyle": "apa",
        })
        self.assertEqual(res["matchedCount"], 2)
        self.assertEqual(res["missingInBib"], ["(Sugiyono, 2022)"])
        self.assertEqual(len(res["uncitedInBody"]), 1)
        self.assertIn("UNESCO", res["uncitedInBody"][0])
        self.assertEqual(res["score"], 50)

    def test_guideline_parser_txt_and_docx(self):
        txt_res = extract_guideline_text(b"Margin atas 4 cm, kiri 4 cm, font Times New Roman 12 pt.", "pedoman.txt")
        self.assertIn("Times New Roman", txt_res["text"])

        docx_res = extract_guideline_text(_make_sample_docx_bytes(), "pedoman.docx")
        self.assertIn("BAB I PENDAHULUAN", docx_res["text"])

    def test_sqlite_guideline_crud_lifecycle(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test_makarapi.db"
            init_db(db_path)
            initial = list_guideline_profiles(db_path)
            self.assertGreaterEqual(len(initial), 3)

            created = create_guideline_profile(
                name="Pedoman Prodi Informatika Uji",
                institution="Universitas Uji",
                rules=[
                    {"key": "paperSize", "label": "Ukuran Kertas", "value": "A4", "displayValue": "A4"},
                    {"key": "fontFamily", "label": "Jenis Font", "value": "Times New Roman", "displayValue": "Times New Roman"},
                ],
                db_path=db_path,
            )
            self.assertFalse(created["isBuiltin"])
            self.assertEqual(created["name"], "Pedoman Prodi Informatika Uji")

            after_add = list_guideline_profiles(db_path)
            self.assertEqual(len(after_add), len(initial) + 1)

            # Built-in tidak boleh dihapus
            builtin_id = next(p["id"] for p in initial if p["isBuiltin"])
            with self.assertRaises(ValueError):
                delete_guideline_profile(builtin_id, db_path=db_path)

            # Custom dapat dihapus
            self.assertTrue(delete_guideline_profile(created["id"], db_path=db_path))
            self.assertEqual(len(list_guideline_profiles(db_path)), len(initial))

    def test_document_readiness_audit_and_report(self):
        res = audit_document_readiness({
            "format": {"showCover": True, "paperSize": "A4", "fontFamily": "Times New Roman", "citationStyle": "apa"},
            "cover": {"title": "ANALISIS AI", "authors": "Budi (123)", "university": "Universitas Merdeka"},
            "content": "BAB I PENDAHULUAN\nLihat Tabel 1 (Russell & Norvig, 2021).\nBAB II PEMBAHASAN\nIsi.",
            "citations": [],
            "manualBibliography": "Russell, S., & Norvig, P. (2021). Artificial intelligence. Pearson.",
            "importMeta": {"hasEquations": True, "hasFootnotes": False},
        })
        by_id = {c["id"]: c for c in res["checks"]}
        self.assertTrue(by_id["cover"]["passed"])
        self.assertTrue(by_id["structure"]["passed"])
        self.assertTrue(by_id["citations"]["passed"])
        self.assertFalse(by_id["media_xref"]["passed"])
        self.assertFalse(by_id["complex_ooxml"]["passed"])
        self.assertIn("LAPORAN AUDIT KELAYAKAN MAKALAH", res["reportText"])

    def test_abstract_and_heading3_end_to_end(self):
        doc = Document()
        doc.add_paragraph("ANALISIS SISTEM FORMAT OTOMATIS")
        doc.add_paragraph("ABSTRAK")
        doc.add_paragraph("Makalah ini membahas desain sistem format dokumen akademik.")
        doc.add_paragraph("Kata Kunci: makalah, format otomatis, OOXML")
        doc.add_paragraph("BAB I PENDAHULUAN")
        doc.add_paragraph("1.1 Latar Belakang")
        doc.add_paragraph("1.1.1 Konteks Akademik")
        doc.add_paragraph("Isi paragraf sub-sub-bab.")
        buf = io.BytesIO()
        doc.save(buf)

        parsed = parse_docx_bytes(buf.getvalue(), "abs_h3.docx")
        self.assertIn("desain sistem format", parsed["abstractBody"])
        self.assertEqual(parsed["abstractKeywords"], "makalah, format otomatis, OOXML")

        out_bytes = build_docx_from_payload({
            "format": {"showCover": False, "showAbstract": True, "showPreface": False, "showToc": True, "showLot": False, "showLof": False},
            "abstract": {"body": parsed["abstractBody"], "keywords": parsed["abstractKeywords"]},
            "tocEntries": [
                {"title": "ABSTRAK", "page": "i", "level": 1, "bold": True},
                {"title": "BAB I PENDAHULUAN", "page": 1, "level": 1, "bold": True},
                {"title": "1.1 Latar Belakang", "page": 1, "level": 2, "bold": False},
                {"title": "1.1.1 Konteks Akademik", "page": 1, "level": 3, "bold": False},
            ],
            "chapters": [{"blocks": [
                {"type": "bab", "babLabel": "BAB I", "babSubtitle": "PENDAHULUAN"},
                {"type": "subbab", "html": "1.1 Latar Belakang"},
                {"type": "subsubbab", "html": "1.1.1 Konteks Akademik"},
                {"type": "paragraph", "html": "Isi paragraf sub-sub-bab."},
            ]}],
        })
        with zipfile.ZipFile(io.BytesIO(out_bytes)) as z:
            self.assertIsNone(z.testzip())
            doc_xml = z.read("word/document.xml").decode("utf-8")
            self.assertIn("ABSTRAK", doc_xml)
            self.assertIn("Kata Kunci: ", doc_xml)
            self.assertIn('w:val="Heading3"', doc_xml)
            self.assertIn('TOC \\o "1-3"', doc_xml)

    def test_academic_linter_kbbi_and_foreign_italics(self):
        sample = (
            "BAB I PENDAHULUAN\n"
            "A. Analisa Artificial Intelligence\n"
            "Dalam praktek pendidikan modern, analisa resiko penggunaan artificial intelligence "
            "dan <i>machine learning</i> serta deep learning perlu diteliti di https://example.com/online.\n"
            "[GAMBAR id=\"g1\" judul=\"Arsitektur software online\"]\n"
        )
        res = lint_academic_text(sample, fix_kbbi=True, italicize_foreign=True)
        self.assertIn("A. Analisis Artificial Intelligence", res["text"])
        self.assertIn("praktik pendidikan modern, analisis risiko", res["text"])
        self.assertIn("<i>artificial intelligence</i>", res["text"])
        self.assertIn("<i>deep learning</i>", res["text"])
        # Pastikan tidak terjadi double-wrap <i><i>machine learning</i></i>
        self.assertNotIn("<i><i>", res["text"])
        # URL dan tag [GAMBAR] tidak boleh rusak
        self.assertIn("https://example.com/online", res["text"])
        self.assertIn('[GAMBAR id="g1" judul="Arsitektur software online"]', res["text"])
        self.assertGreaterEqual(res["kbbiCount"], 4)
        self.assertEqual(res["foreignCount"], 2)

    def test_owasp_security_rate_limit_and_zip_guards(self):
        # 1. Rate limiter sliding-window
        rl = SlidingWindowRateLimiter(max_requests=3, window_seconds=60)
        for idx in range(3):
            ok, rem, retry = rl.check("127.0.0.1", now=100.0 + idx)
            self.assertTrue(ok)
            self.assertEqual(rem, 2 - idx)
            self.assertEqual(retry, 0)
        ok, rem, retry = rl.check("127.0.0.1", now=105.0)
        self.assertFalse(ok)
        self.assertEqual(rem, 0)
        self.assertGreater(retry, 0)

        # 2. Validasi ZIP path traversal pada .docx ditolak (400)
        bad_zip_buf = io.BytesIO()
        with zipfile.ZipFile(bad_zip_buf, "w") as zf:
            zf.writestr("../evil.xml", "<x/>")
            zf.writestr("word/document.xml", "<w:document/>")
        with self.assertRaises(HTTPException) as ctx:
            validate_docx_zip_safety(bad_zip_buf.getvalue())
        self.assertEqual(ctx.exception.status_code, 400)

        # 3. Validasi batas ukuran (413) & header PDF palsu (400)
        with self.assertRaises(HTTPException) as ctx_sz:
            validate_docx_zip_safety(b"PK\x03\x04" + b"0" * 1024, max_bytes=512)
        self.assertEqual(ctx_sz.exception.status_code, 413)
        with self.assertRaises(HTTPException) as ctx_pdf:
            validate_guideline_upload_safety(b"NOT_A_PDF", "pedoman.pdf")
        self.assertEqual(ctx_pdf.exception.status_code, 400)

        # 4. Header keamanan OWASP & rute PWA terdaftar
        for hdr in ("X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"):
            self.assertIn(hdr, SECURITY_HEADERS)
        paths = {r.path for r in app.routes}
        self.assertIn("/manifest.webmanifest", paths)
        self.assertIn("/sw.js", paths)
        self.assertTrue((Path(__file__).resolve().parent.parent / "manifest.webmanifest").is_file())
        self.assertTrue((Path(__file__).resolve().parent.parent / "sw.js").is_file())
        self.assertTrue((Path(__file__).resolve().parent.parent / "icons" / "icon-192.png").is_file())

    def test_supabase_rls_and_capacitor_release_configs(self):
        root = Path(__file__).resolve().parent.parent
        sql = (root / "supabase" / "schema_rls.sql").read_text(encoding="utf-8")
        self.assertIn("ENABLE ROW LEVEL SECURITY", sql)
        self.assertIn("auth.uid() = user_id", sql)
        self.assertIn("public.user_guidelines", sql)
        self.assertIn("public.paper_drafts", sql)

        import json
        cap = json.loads((root / "capacitor.config.json").read_text(encoding="utf-8"))
        self.assertEqual(cap["appId"], "id.makarapi.app")
        self.assertFalse(cap["server"]["cleartext"])
        self.assertFalse(cap["android"]["allowMixedContent"])
        self.assertTrue((root / "Dockerfile").is_file())
        self.assertTrue((root / "render.yaml").is_file())
        self.assertTrue((root / "js" / "supabase-client.js").is_file())

        vercel_cfg = json.loads((root / "vercel.json").read_text(encoding="utf-8"))
        self.assertEqual(vercel_cfg["rewrites"][0]["destination"], "/api/index.py")
        from api.index import app as vercel_app
        self.assertIs(vercel_app, app)

    def test_pdf_to_word_multilevel_numbering_split_tables_and_narrative_citations(self):
        from docx.oxml import parse_xml
        from docx.oxml.ns import nsdecls, qn

        doc = Document()
        # Definisikan abstractNum multi-level %1.%2 dan %1.%2.%3 untuk menguji resolver %2/%3
        num_part = doc.part.numbering_part._element
        abs_xml = parse_xml(
            f'<w:abstractNum {nsdecls("w")} w:abstractNumId="99">'
            f'<w:multiLevelType w:val="multilevel"/>'
            f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>'
            f'<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>'
            f'<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3"/></w:lvl>'
            f'</w:abstractNum>'
        )
        num_xml = parse_xml(f'<w:num {nsdecls("w")} w:numId="99"><w:abstractNumId w:val="99"/></w:num>')
        first_num = num_part.find(qn("w:num"))
        if first_num is not None:
            first_num.addprevious(abs_xml)
        else:
            num_part.append(abs_xml)
        num_part.append(num_xml)

        def add_num_p(text: str, ilvl: int):
            p = doc.add_paragraph(text)
            pPr = p._p.get_or_add_pPr()
            pPr.append(parse_xml(f'<w:numPr {nsdecls("w")}><w:ilvl w:val="{ilvl}"/><w:numId w:val="99"/></w:numPr>'))
            return p

        # Cover dengan header generik yang harus dilewati
        doc.add_paragraph("USULAN PENELITIAN")
        doc.add_paragraph("PERAN FINANCIAL LITERACY DALAM MENINGKATKAN KINERJA UMKM")
        doc.add_paragraph("Oleh: Mahasiswa Uji")

        doc.add_paragraph("BAB I PENDAHULUAN")
        add_num_p("Latar Belakang", 1)
        doc.add_paragraph("Menurut Arianti (2021) literasi keuangan memengaruhi kinerja dalam kategori")
        doc.add_paragraph("menengah serta pemanfaatan fintech pada pelaku UMKM.")
        add_num_p("Rumusan Masalah", 1)
        add_num_p("Sistematika Penulisan BAB II : KAJIAN PUSTAKA", 1)
        doc.add_paragraph("Bab ini membahas kajian teori.")

        doc.add_paragraph("BAB II KAJIAN PUSTAKA")
        add_num_p("Kajian Teoritis", 1)
        add_num_p("Financial Literacy", 2)
        doc.add_paragraph("Tabel 3. 1 Skala Likert")
        t1 = doc.add_table(rows=2, cols=2)
        t1.cell(0, 0).text = "No"
        t1.cell(0, 1).text = "Nilai"
        t1.cell(1, 0).text = "1"
        t1.cell(1, 1).text = "Sangat Setuju"
        # Tabel lanjutan terpecah dengan header sama
        t2 = doc.add_table(rows=2, cols=2)
        t2.cell(0, 0).text = "No"
        t2.cell(0, 1).text = "Nilai"
        t2.cell(1, 0).text = "2"
        t2.cell(1, 1).text = "Setuju"

        doc.add_paragraph("DAFTAR PUSTAKA")
        doc.add_paragraph("Arianti, B. F. (2021). Literasi Keuangan (Teori dan Implementasinya) Di")
        doc.add_paragraph("Indonesia. Pena Persada.")
        doc.add_paragraph("KUESIONER PENELITIAN")
        doc.add_paragraph("Identitas Responden: Nama Usaha")

        buf = io.BytesIO()
        doc.save(buf)
        parsed = parse_docx_bytes(buf.getvalue(), "usulan_pdf_convert.docx")

        self.assertEqual(parsed["suggestedTitle"], "PERAN FINANCIAL LITERACY DALAM MENINGKATKAN KINERJA UMKM")
        self.assertEqual(parsed["babCount"], 2)
        self.assertNotIn("%2", parsed["bodyText"])
        self.assertNotIn("%3", parsed["bodyText"])
        self.assertIn("1.1 Latar Belakang", parsed["bodyText"])
        self.assertIn("1.2 Rumusan Masalah", parsed["bodyText"])
        self.assertIn("2.1 Kajian Teoritis", parsed["bodyText"])
        self.assertIn("2.1.1 Financial Literacy", parsed["bodyText"])
        self.assertIn("dalam kategori menengah", parsed["bodyText"])
        self.assertEqual(parsed["tableCount"], 1)
        self.assertIn('[TABEL judul="Skala Likert"]', parsed["bodyText"])
        self.assertIn("2 | Setuju", parsed["bodyText"])
        self.assertNotIn("KUESIONER", parsed["bibliography"])
        self.assertEqual(len(parsed["bibliography"].splitlines()), 1)
        self.assertIn("Indonesia. Pena Persada.", parsed["bibliography"])

        cit = audit_citations({
            "content": parsed["bodyText"],
            "citations": [],
            "manualBibliography": parsed["bibliography"],
            "citationStyle": "apa",
        })
        self.assertEqual(cit["score"], 100)
        self.assertEqual(cit["matchedCount"], 1)

    def test_style_inherited_upper_roman_bab_daftar_rujukan_and_sistematika_without_colon(self):
        from docx.oxml import parse_xml
        from docx.oxml.ns import nsdecls, qn

        doc = Document()
        num_part = doc.part.numbering_part._element
        abs_xml = parse_xml(
            f'<w:abstractNum {nsdecls("w")} w:abstractNumId="77">'
            f'<w:multiLevelType w:val="multilevel"/>'
            f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="BAB %1"/></w:lvl>'
            f'<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>'
            f'<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3"/></w:lvl>'
            f'</w:abstractNum>'
        )
        num_xml = parse_xml(f'<w:num {nsdecls("w")} w:numId="77"><w:abstractNumId w:val="77"/></w:num>')
        first_num = num_part.find(qn("w:num"))
        if first_num is not None:
            first_num.addprevious(abs_xml)
        else:
            num_part.append(abs_xml)
        num_part.append(num_xml)

        # Tempelkan numPr ke style Heading 1/2/3 di word/styles.xml (seperti template skripsi resmi)
        for st_name, ilvl in (("Heading 1", 0), ("Heading 2", 1), ("Heading 3", 2)):
            st_el = doc.styles[st_name].element
            pPr = st_el.find(qn("w:pPr"))
            if pPr is None:
                pPr = parse_xml(f'<w:pPr {nsdecls("w")}/>')
                st_el.append(pPr)
            pPr.append(parse_xml(f'<w:numPr {nsdecls("w")}><w:ilvl w:val="{ilvl}"/><w:numId w:val="77"/></w:numPr>'))

        # Cover dengan kata miring dan header generik PROPOSAL ARTIKEL
        doc.add_paragraph("PROPOSAL ARTIKEL")
        p_cov = doc.add_paragraph()
        p_cov.add_run("PENGARUH ")
        r_it = p_cov.add_run("SELF-EFFICACY")
        r_it.italic = True
        p_cov.add_run(" TERHADAP KESIAPAN KERJA MAHASISWA")

        # DAFTAR ISI memakai Heading 1 tetapi mematikan numPr lewat numId=0
        p_di = doc.add_paragraph("DAFTAR ISI", style="Heading 1")
        p_di._p.get_or_add_pPr().append(parse_xml(f'<w:numPr {nsdecls("w")}><w:numId w:val="0"/></w:numPr>'))

        # BAB I..II dari style Heading 1/2/3 + Sistematika Penulisan tanpa titik dua
        doc.add_paragraph("PENDAHULUAN", style="Heading 1")
        doc.add_paragraph("Latar Belakang", style="Heading 2")
        doc.add_paragraph("Data awal (Garuda, SAGE, ScienceDirect, 2017–2021) dan (Mahasiswa Manajemen 2019 FEB UMM) dikaji bersama van Gelderen et al. (2008).")
        doc.add_paragraph("Sistematika Penulisan", style="Heading 2")
        doc.add_paragraph("BAB I PENDAHULUAN")
        doc.add_paragraph("Bab ini menguraikan latar belakang masalah.")
        doc.add_paragraph("BAB II KAJIAN PUSTAKA")
        doc.add_paragraph("Bab ini membahas landasan teori.")

        doc.add_paragraph("KAJIAN PUSTAKA", style="Heading 1")
        doc.add_paragraph("Kajian Teoritis", style="Heading 2")
        doc.add_paragraph("Konsep Dasar", style="Heading 3")
        doc.add_paragraph("Menurut Sugiyono (2023) metode kuantitatif sangat relevan.")

        doc.add_paragraph("DAFTAR RUJUKAN")
        doc.add_paragraph("Sugiyono. (2023). Metode Penelitian Kuantitatif. Alfabeta.")
        doc.add_paragraph("van Gelderen, M., et al. (2008). Explaining entrepreneurial intentions. Career Development International.")
        doc.add_paragraph("KUESIONER PENELITIAN")
        doc.add_paragraph("Daftar pertanyaan kuesioner.")

        buf = io.BytesIO()
        doc.save(buf)
        parsed = parse_docx_bytes(buf.getvalue(), "template_style_heading.docx")

        # Judul cover bersih tanpa tag <I>
        self.assertEqual(parsed["suggestedTitle"], "PENGARUH SELF-EFFICACY TERHADAP KESIAPAN KERJA MAHASISWA")
        self.assertNotIn("<I>", parsed["suggestedTitle"])
        # Tepat 2 BAB (5 baris sistematika tidak boleh jadi BAB palsu, DAFTAR ISI tidak jadi BAB I)
        self.assertEqual(parsed["babCount"], 2)
        self.assertIn("BAB I PENDAHULUAN", parsed["bodyText"])
        self.assertIn("1.1 Latar Belakang", parsed["bodyText"])
        self.assertIn("BAB II KAJIAN PUSTAKA", parsed["bodyText"])
        self.assertIn("2.1 Kajian Teoritis", parsed["bodyText"])
        self.assertIn("2.1.1 Konsep Dasar", parsed["bodyText"])
        # DAFTAR RUJUKAN terekstrak, KUESIONER terpotong
        self.assertEqual(len(parsed["bibliography"].splitlines()), 2)
        self.assertNotIn("KUESIONER", parsed["bibliography"])

        # Non-sitasi (Garuda..., Mahasiswa Manajemen...) tidak bikin false positive; van Gelderen & Sugiyono cocok 100%
        cit = audit_citations({
            "content": parsed["bodyText"],
            "citations": [],
            "manualBibliography": parsed["bibliography"],
            "citationStyle": "apa",
        })
        self.assertEqual(cit["inTextCount"], 2)
        self.assertEqual(cit["matchedCount"], 2)
        self.assertEqual(cit["score"], 100)

    def test_english_proposal_chapter_references_and_linter_skip(self):
        doc = Document()
        doc.add_paragraph("A RESEARCH PROPOSAL")
        doc.add_paragraph("STUDENTS PERCEPTIONS OF ENGLISH CLUB ON SPEAKING SKILL")
        doc.add_paragraph("TABLE OF CONTENT")
        doc.add_paragraph("CHAPTHER I")
        doc.add_paragraph("INTRODUCTION")
        doc.add_paragraph(
            "In this research study, students of the university improve their speaking skill with online feedback "
            "and purposive sampling. The results of the study show that students who are active in the club have "
            "better confidence and communication from their regular practice according to Riyadini (2022)."
        )
        doc.add_paragraph("CHAPTER II")
        doc.add_paragraph("LITERATURE REVIEW")
        doc.add_paragraph("This chapter discusses the framework and theories used in the research.")
        doc.add_paragraph("REFERENCES")
        doc.add_paragraph("Riyadini, A. (2022). English Club Impact on Speaking Skill. Journal of English Education.")

        buf = io.BytesIO()
        doc.save(buf)
        parsed = parse_docx_bytes(buf.getvalue(), "english_proposal.docx")

        self.assertEqual(parsed["suggestedTitle"], "STUDENTS PERCEPTIONS OF ENGLISH CLUB ON SPEAKING SKILL")
        self.assertEqual(parsed["babCount"], 2)
        self.assertEqual(len(parsed["bibliography"].splitlines()), 1)
        self.assertNotIn("TABLE OF CONTENT", parsed["bodyText"])

        cit = audit_citations({
            "content": parsed["bodyText"],
            "citations": [],
            "manualBibliography": parsed["bibliography"],
            "citationStyle": "apa",
        })
        self.assertEqual(cit["score"], 100)

        # Naskah dominan Inggris: Italic Asing otomatis dilewati agar tidak memiringkan teks Inggris
        lint = lint_academic_text(parsed["bodyText"], fix_kbbi=False, italicize_foreign=True)
        self.assertEqual(lint["foreignCount"], 0)
        self.assertEqual(lint["skippedReason"], "english_document")


if __name__ == "__main__":
    unittest.main()

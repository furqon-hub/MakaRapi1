"""
MakaRapi — Audit Kelayakan Dokumen Makalah (Document Readiness Report)
Menggabungkan pemeriksaan kelengkapan cover, struktur BAB wajib, konsistensi sitasi,
referensi silang tabel/gambar, kepatuhan pedoman kampus, dan deteksi elemen kompleks.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

from .citation_checker import audit_citations

BAB_RX = re.compile(r"^(?:#+\s*)?(?:\*\*|__)?\s*BAB\s+([IVXLCDM0-9]+)\b", re.I | re.M)
TABLE_TAG_RX = re.compile(r"^\[TABEL\b", re.I | re.M)
FIGURE_TAG_RX = re.compile(r"^\[GAMBAR\b", re.I | re.M)
MENTION_TABLE_RX = re.compile(r"\bTabel\s+\d+(?:\.\d+)?\b", re.I)
MENTION_FIGURE_RX = re.compile(r"\bGambar\s+\d+(?:\.\d+)?\b", re.I)


def _is_rule_compliant(fmt: Dict[str, Any], rule: Dict[str, Any]) -> bool:
    key = rule.get("key")
    expected = rule.get("value")
    if key not in fmt:
        return True
    actual = fmt.get(key)
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        try:
            return abs(float(actual) - float(expected)) < 0.02
        except Exception:
            return False
    return str(actual).lower() == str(expected).lower()


def audit_document_readiness(payload: Dict[str, Any]) -> Dict[str, Any]:
    fmt = payload.get("format") or {}
    cover = payload.get("cover") or {}
    preface = payload.get("preface") or {}
    content = str(payload.get("content") or "")
    citations = payload.get("citations") or []
    manual_bib = str(payload.get("manualBibliography") or "")
    guideline = payload.get("guidelineProfile")
    import_meta = payload.get("importMeta") or {}

    checks: List[Dict[str, Any]] = []

    # 1. Kelengkapan Cover
    if fmt.get("showCover", True):
        missing_cover = []
        title = str(cover.get("title") or "").strip()
        if not title or title.upper() in ("JUDUL MAKALAH", "JUDUL MAKALAH AKADEMIK"):
            missing_cover.append("Judul")
        if not str(cover.get("authors") or "").strip():
            missing_cover.append("Nama & NIM Penyusun")
        if not str(cover.get("university") or "").strip():
            missing_cover.append("Universitas/Institusi")
        checks.append({
            "id": "cover",
            "label": "Identitas Halaman Cover",
            "passed": len(missing_cover) == 0,
            "severity": "ok" if not missing_cover else "warn",
            "detail": "Identitas cover lengkap." if not missing_cover else f"Belum diisi: {', '.join(missing_cover)}.",
        })

    # 2. Struktur BAB Wajib
    babs = BAB_RX.findall(content)
    bab_ok = len(babs) >= 2
    checks.append({
        "id": "structure",
        "label": "Struktur BAB Makalah",
        "passed": bab_ok,
        "severity": "ok" if bab_ok else "warn",
        "detail": f"Terdeteksi {len(babs)} BAB terstruktur." if bab_ok else f"Baru terdeteksi {len(babs)} BAB (disarankan minimal BAB I–III).",
    })

    # 3. Daftar Pustaka & Konsistensi Sitasi
    cit_audit = audit_citations({
        "content": content,
        "citations": citations,
        "manualBibliography": manual_bib,
        "citationStyle": fmt.get("citationStyle", "apa"),
    })
    has_bib = cit_audit["bibCount"] > 0
    cit_ok = has_bib and not cit_audit["missingInBib"] and not cit_audit["uncitedInBody"]
    if not has_bib and cit_audit["inTextCount"] == 0:
        cit_detail = "Belum ada sitasi atau Daftar Pustaka."
    elif cit_ok:
        cit_detail = f"{cit_audit['matchedCount']}/{cit_audit['bibCount']} sitasi konsisten dengan Daftar Pustaka."
    else:
        issues = []
        if cit_audit["missingInBib"]:
            issues.append(f"{len(cit_audit['missingInBib'])} kutipan belum di Daftar Pustaka")
        if cit_audit["uncitedInBody"]:
            issues.append(f"{len(cit_audit['uncitedInBody'])} referensi belum dikutip")
        cit_detail = "; ".join(issues) + "."
    checks.append({
        "id": "citations",
        "label": "Konsistensi Sitasi & Daftar Pustaka",
        "passed": cit_ok,
        "severity": "ok" if cit_ok else ("err" if cit_audit["missingInBib"] else "warn"),
        "detail": cit_detail,
    })

    # 4. Referensi Silang Tabel & Gambar
    plain_body = re.sub(r"\[TABEL[^\]]*\][\s\S]*?\[\/TABEL\]|\[GAMBAR[^\]]*\]", " ", content, flags=re.I)
    tbl_count = len(TABLE_TAG_RX.findall(content))
    fig_count = len(FIGURE_TAG_RX.findall(content))
    mentioned_tbl = bool(MENTION_TABLE_RX.search(plain_body))
    mentioned_fig = bool(MENTION_FIGURE_RX.search(plain_body))
    xref_issues = []
    if mentioned_tbl and tbl_count == 0:
        xref_issues.append("Teks menyebut Tabel tetapi belum ada blok [TABEL]")
    if mentioned_fig and fig_count == 0:
        xref_issues.append("Teks menyebut Gambar tetapi belum ada tag [GAMBAR]")
    checks.append({
        "id": "media_xref",
        "label": "Kesesuaian Tabel & Gambar",
        "passed": len(xref_issues) == 0,
        "severity": "ok" if not xref_issues else "warn",
        "detail": (
            f"{tbl_count} tabel & {fig_count} gambar terverifikasi."
            if not xref_issues
            else "; ".join(xref_issues) + "."
        ),
    })

    # 5. Kepatuhan Pedoman Kampus (jika aktif)
    if guideline and isinstance(guideline.get("rules"), list) and guideline["rules"]:
        rules = guideline["rules"]
        matched_r = sum(1 for r in rules if _is_rule_compliant(fmt, r))
        all_ok = matched_r == len(rules)
        checks.append({
            "id": "guideline",
            "label": f"Kepatuhan Pedoman ({guideline.get('name', 'Aktif')})",
            "passed": all_ok,
            "severity": "ok" if all_ok else "warn",
            "detail": f"{matched_r}/{len(rules)} aturan pedoman terpenuhi.",
        })

    # 6. Catatan Elemen Kompleks dari Impor DOCX (Persamaan Matematika / Footnote)
    complex_notes = []
    if import_meta.get("hasEquations"):
        complex_notes.append("persamaan matematika (Equation)")
    if import_meta.get("hasFootnotes"):
        complex_notes.append("catatan kaki (Footnote)")
    if complex_notes:
        checks.append({
            "id": "complex_ooxml",
            "label": "Elemen Kompleks Dokumen Asal",
            "passed": False,
            "severity": "warn",
            "detail": f"Dokumen asal memiliki {' dan '.join(complex_notes)} — periksa kembali bagian tersebut setelah ekspor .docx.",
        })

    passed_count = sum(1 for c in checks if c["passed"])
    total_count = len(checks) or 1
    score = int(round((passed_count / total_count) * 100))
    status = "siap" if score == 100 else ("perlu_tinjauan" if score >= 60 else "belum_lengkap")

    # Susun laporan teks siap unduh
    report_lines = [
        "LAPORAN AUDIT KELAYAKAN MAKALAH — MAKARAPI",
        "=" * 52,
        f"Judul   : {cover.get('title') or '-'}",
        f"Skor    : {score}% ({passed_count}/{total_count} pemeriksaan lulus)",
        f"Status  : {'SIAP EKSPOR' if status == 'siap' else 'PERLU TINJAUAN'}",
        "-" * 52,
    ]
    for c in checks:
        mark = "[LULUS]" if c["passed"] else "[PERHATIAN]"
        report_lines.append(f"{mark} {c['label']}: {c['detail']}")
    if cit_audit["missingInBib"]:
        report_lines.append("")
        report_lines.append("Sitasi belum tercantum di Daftar Pustaka:")
        for item in cit_audit["missingInBib"]:
            report_lines.append(f"  - {item}")
    if cit_audit["uncitedInBody"]:
        report_lines.append("")
        report_lines.append("Referensi di Daftar Pustaka yang belum dikutip:")
        for item in cit_audit["uncitedInBody"]:
            report_lines.append(f"  - {item}")

    return {
        "engine": "python-readiness-audit",
        "score": score,
        "status": status,
        "passedCount": passed_count,
        "totalCount": total_count,
        "checks": checks,
        "citationAudit": cit_audit,
        "reportText": "\n".join(report_lines),
    }

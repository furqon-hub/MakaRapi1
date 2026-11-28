"""
MakaRapi — Parser Dokumen Word (.docx) Berbasis Python (python-docx + lxml)
Mengekstrak teks, struktur BAB/Sub-bab, daftar bernomor, tabel, gambar tertanam
(base64), Kata Pengantar, dan Daftar Pustaka dengan urutan blok yang presisi.
"""

from __future__ import annotations

import base64
import io
import re
from typing import Any, Dict, List, Tuple

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

FIG_CAP_RX = re.compile(r"^(?:Gambar|Gbr\.?|Figure|Fig\.?)\s*\d*(?:\s*\.\s*\d+)*\s*[:.\-\u2013\u2014]?\s*(.+)$", re.I)
TBL_CAP_RX = re.compile(r"^(?:Tabel|Tbl\.?|Table)\s*\d*(?:\s*\.\s*\d+)*\s*[:.\-\u2013\u2014]?\s*(.+)$", re.I)
SRC_RX = re.compile(r"^Sumber\s*[:\-\u2013\u2014]\s*(.+)$", re.I)

BAB_RX = re.compile(r"^(?:BAB|CHAPTH?ER)\s+[IVXLCDM0-9]+\b", re.I)
SISTEMATIKA_BAB_RX = re.compile(r"^(?:BAB|CHAPTH?ER)\s+[IVXLCDM0-9]+\s*:", re.I)
SISTEMATIKA_DESC_RX = re.compile(r"^(?:Bab|Chapter)\s+(?:ini|tersebut)\b", re.I)
GENERIC_COVER_HEADER_RX = re.compile(
    r"^(?:MAKALAH|USULAN\s+PENELITIAN|(?:A\s+)?RESEARCH\s+PROPOSAL|THESIS(?:\s+PROPOSAL)?|"
    r"PROPOSAL(?:\s+(?:SKRIPSI|PENELITIAN|TESIS|ARTIKEL|SEMINAR))?|"
    r"SKRIPSI|TESIS|DISERTASI|TUGAS\s+AKHIR|ARTIKEL\s+ILMIAH|LAPORAN(?:\s+\w+){0,2}|KARYA\s+(?:TULIS\s+)?ILMIAH)$",
    re.I,
)
APPENDIX_RX = re.compile(
    r"^(?:LAMPIRAN(?:\s+[IVXLCDM0-9A-Z]+)?|APPENDI(?:X|CES)(?:\s+[IVXLCDM0-9A-Z]+)?|"
    r"KUESIONER(?:\s+PENELITIAN)?|INSTRUMEN\s+PENELITIAN|PEDOMAN\s+WAWANCARA|RIWAYAT\s+HIDUP|BIODATA(?:\s+PENULIS)?)\b",
    re.I,
)
ABSTRACT_RX = re.compile(r"^(?:ABSTRAK|ABSTRACT|INTISARI)$", re.I)
KEYWORDS_RX = re.compile(r"^(?:Kata\s+Kunci|Keywords?)\s*[:\-–—]\s*(.+)$", re.I)
PREFACE_RX = re.compile(r"^(?:KATA\s+PENGANTAR|PRAKATA|PREFACE|ACKNOWLEDGEMENTS?)$", re.I)
FRONT_LIST_RX = re.compile(
    r"^(?:DAFTAR\s+ISI|DAFTAR\s+TABEL|DAFTAR\s+GAMBAR|TABLE\s+OF\s+CONTENTS?|LIST\s+OF\s+TABLES?|LIST\s+OF\s+FIGURES?)$",
    re.I,
)
BIB_RX = re.compile(
    r"^(?:DAFTAR\s+PUSTAKA|DAFTAR\s+RUJUKAN|REFERENSI|REFERENCES?|BIBLIOGRAFI|BIBLIOGRAPHY|WORKS\s+CITED)$",
    re.I,
)

ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def _strip_html_tags(val: str) -> str:
    return re.sub(r"<[^>]+>", "", str(val or "")).strip()


def _is_real_bab_heading(line: str, next_line: str = "") -> bool:
    t = _clean_text(_strip_html_tags(line))
    if not t or len(t) > 120:
        return False
    if not BAB_RX.match(t) or SISTEMATIKA_BAB_RX.match(t):
        return False
    if next_line and SISTEMATIKA_DESC_RX.match(_clean_text(_strip_html_tags(next_line))):
        return False
    return True


def _parse_bab_number(line: str) -> int:
    m = re.match(r"^(?:BAB|CHAPTH?ER)\s+([IVXLCDM]+|\d+)\b", _clean_text(_strip_html_tags(line)), re.I)
    if not m:
        return 0
    tok = m.group(1).upper()
    if tok.isdigit():
        return int(tok)
    total = 0
    prev = 0
    for ch in reversed(tok):
        val = ROMAN_VALUES.get(ch, 0)
        if val < prev:
            total -= val
        else:
            total += val
            prev = val
    return total


def _to_roman(val: int, lower: bool = False) -> str:
    if val <= 0:
        val = 1
    pairs = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ]
    out: List[str] = []
    n = val
    for num, sym in pairs:
        while n >= num:
            out.append(sym)
            n -= num
    res = "".join(out)
    return res.lower() if lower else res

MIME_BY_EXT = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
}


def _sanitize_attr(val: str) -> str:
    return (
        str(val or "")
        .replace('"', "'")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("]", ")")
        .strip()
    )


def _clean_text(val: str) -> str:
    cleaned = re.sub(r"[\u200b-\u200d\ufeff]", "", str(val or "").replace("\u00A0", " "))
    return re.sub(r"[ \t]+", " ", cleaned).strip()


def _extract_paragraph_text_with_italics(paragraph: Paragraph) -> str:
    """Ekstrak teks paragraf sambil mempertahankan huruf miring (istilah asing/judul) sebagai <i>...</i>."""
    plain = _clean_text(paragraph.text)
    if not plain:
        return ""
    # Jangan bungkus judul BAB, Sub-bab, atau baris khusus dengan tag italic
    if BAB_RX.match(plain) or PREFACE_RX.match(plain) or FRONT_LIST_RX.match(plain) or BIB_RX.match(plain):
        return plain
    if FIG_CAP_RX.match(plain) or TBL_CAP_RX.match(plain) or SRC_RX.match(plain):
        return plain
    if re.match(r"^(?:[A-Z]\.\s+|\d+\.\d+(?:\.\d+)*\.?\s+)", plain) and len(plain) <= 130:
        return plain

    runs = paragraph.runs
    if not runs:
        return plain

    # Gabungkan run berdekatan dengan status italic sama
    segments: List[Tuple[bool, str]] = []
    for r in runs:
        t = re.sub(r"[\u200b-\u200d\ufeff]", "", str(r.text or "").replace("\u00A0", " "))
        if not t:
            continue
        is_it = bool(r.italic)
        if segments and segments[-1][0] == is_it:
            segments[-1] = (is_it, segments[-1][1] + t)
        else:
            segments.append((is_it, t))

    has_italic = any(is_it and seg.strip() for is_it, seg in segments)
    has_normal = any((not is_it) and seg.strip() for is_it, seg in segments)
    # Jika seluruh paragraf miring atau tidak ada miring sama sekali, kembalikan teks polos
    if not has_italic or not has_normal:
        return plain

    out_parts: List[str] = []
    for is_it, seg in segments:
        if is_it and seg.strip():
            lead = " " if seg.startswith((" ", "\t")) else ""
            trail = " " if seg.endswith((" ", "\t")) else ""
            inner = re.sub(r"[ \t]+", " ", seg).strip()
            out_parts.append(f"{lead}<i>{inner}</i>{trail}")
        else:
            out_parts.append(seg)
    return re.sub(r"[ \t]+", " ", "".join(out_parts)).strip()


def _probe_image_dims(blob: bytes) -> Tuple[int, int]:
    """Deteksi ukuran piksel (width, height) ringan untuk menyaring potongan gambar mini artefak PDF."""
    if not blob or len(blob) < 24:
        return (0, 0)
    # PNG header
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return (int.from_bytes(blob[16:20], "big"), int.from_bytes(blob[20:24], "big"))
    # GIF header
    if blob[:6] in (b"GIF87a", b"GIF89a"):
        return (int.from_bytes(blob[6:8], "little"), int.from_bytes(blob[8:10], "little"))
    # JPEG SOF
    if blob[:2] == b"\xff\xd8":
        idx = 2
        n = len(blob)
        while idx + 9 < n:
            if blob[idx] != 0xFF:
                idx += 1
                continue
            marker = blob[idx + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h = (blob[idx + 5] << 8) | blob[idx + 6]
                w = (blob[idx + 7] << 8) | blob[idx + 8]
                return (w, h)
            seg_len = (blob[idx + 2] << 8) | blob[idx + 3]
            if seg_len < 2:
                break
            idx += 2 + seg_len
    try:
        from PIL import Image  # type: ignore

        with Image.open(io.BytesIO(blob)) as im:
            return (int(im.size[0]), int(im.size[1]))
    except Exception:
        return (0, 0)


def _extract_images_from_paragraph(paragraph: Paragraph, doc: Document) -> List[str]:
    """Ambil semua gambar (DrawingML a:blip / VML v:imagedata) di dalam paragraf sebagai data URL."""
    data_urls: List[str] = []
    p_el = paragraph._element

    rel_ids: List[str] = []
    # DrawingML <a:blip r:embed="rId..."/>
    for blip in p_el.iter(qn("a:blip")):
        rid = blip.get(qn("r:embed"))
        if rid:
            rel_ids.append(rid)

    # Legacy VML <v:imagedata r:id="rId..."/>
    for imgdata in p_el.iter("{urn:schemas-microsoft-com:vml}imagedata"):
        rid = imgdata.get(qn("r:id"))
        if rid:
            rel_ids.append(rid)

    for rid in rel_ids:
        rel = doc.part.rels.get(rid)
        if not rel or not hasattr(rel, "target_part"):
            continue
        try:
            part = rel.target_part
            blob = part.blob
            # Saring gambar strip tipis / ikon mini artefak konversi PDF-to-Word (mis. tinggi 28–73 px)
            w_px, h_px = _probe_image_dims(blob)
            if w_px > 0 and h_px > 0 and (h_px < 75 or w_px < 75):
                continue
            ct = getattr(part, "content_type", "") or ""
            if not ct.startswith("image/"):
                partname = str(getattr(part, "partname", "")).lower()
                ext = partname.rsplit(".", 1)[-1] if "." in partname else "png"
                ct = MIME_BY_EXT.get(ext, "image/png")
            b64 = base64.b64encode(blob).decode("ascii")
            data_urls.append(f"data:{ct};base64,{b64}")
        except Exception:
            continue

    return data_urls


def _extract_table_rows(table: Table) -> List[List[str]]:
    rows: List[List[str]] = []
    for tr in table.rows:
        cells: List[str] = []
        seen_tc = set()
        for cell in tr.cells:
            tc_id = id(cell._tc)
            if tc_id in seen_tc:
                continue
            seen_tc.add(tc_id)
            cell_text = " ".join(_clean_text(p.text) for p in cell.paragraphs if _clean_text(p.text))
            cell_text = cell_text.replace("|", "/").strip()
            cells.append(cell_text)
        if any(c != "" for c in cells):
            rows.append(cells)
    return rows


SKIP_SDT_GALLERIES = {
    "table of contents",
    "table of figures",
    "table of tables",
    "table of authorities",
}


def _iter_container_blocks(container, doc: Document):
    """Iterasi paragraf, tabel, dan Content Control (<w:sdt>, mis. Bibliography bawaan Word) secara berurutan."""
    for child in container.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)
        elif child.tag == qn("w:sdt"):
            sdt_pr = child.find(qn("w:sdtPr"))
            gal = sdt_pr.find(f".//{qn('w:docPartGallery')}") if sdt_pr is not None else None
            gal_val = (gal.get(qn("w:val")) or "").strip().lower() if gal is not None else ""
            if gal_val in SKIP_SDT_GALLERIES:
                continue
            sdt_content = child.find(qn("w:sdtContent"))
            if sdt_content is not None:
                yield from _iter_container_blocks(sdt_content, doc)


def _iter_body_blocks(doc: Document):
    """Iterasi paragraf dan tabel secara berurutan sesuai posisi asli di word/document.xml."""
    yield from _iter_container_blocks(doc.element.body, doc)


def _build_numbering_lookup(doc: Document) -> Dict[Tuple[str, int], Tuple[int, str, str, bool]]:
    """Petakan (numId, ilvl_int) -> (start_val, numFmt, lvlText, is_lgl) dari word/numbering.xml untuk penomoran otomatis & bertingkat."""
    lookup: Dict[Tuple[str, int], Tuple[int, str, str, bool]] = {}
    try:
        num_el = doc.part.numbering_part._element
    except Exception:
        return lookup

    abs_map: Dict[str, Dict[int, Tuple[int, str, str, bool]]] = {}
    for abs_num in num_el.findall(qn("w:abstractNum")):
        abs_id = abs_num.get(qn("w:abstractNumId"))
        if abs_id is None:
            continue
        lvls: Dict[int, Tuple[int, str, str, bool]] = {}
        for lvl in abs_num.findall(qn("w:lvl")):
            ilvl_int = int(lvl.get(qn("w:ilvl")) or 0)
            st_el = lvl.find(qn("w:start"))
            fmt_el = lvl.find(qn("w:numFmt"))
            txt_el = lvl.find(qn("w:lvlText"))
            lgl_el = lvl.find(qn("w:isLgl"))
            try:
                start_val = int(st_el.get(qn("w:val"))) if (st_el is not None and st_el.get(qn("w:val"))) else 1
            except Exception:
                start_val = 1
            fmt = fmt_el.get(qn("w:val")) if fmt_el is not None else "decimal"
            ltxt = txt_el.get(qn("w:val")) if txt_el is not None else f"%{ilvl_int + 1}."
            is_lgl = lgl_el is not None and (lgl_el.get(qn("w:val")) not in ("0", "false"))
            lvls[ilvl_int] = (start_val, fmt, ltxt, is_lgl)
        abs_map[abs_id] = lvls

    for num in num_el.findall(qn("w:num")):
        num_id = num.get(qn("w:numId"))
        abs_ref = num.find(qn("w:abstractNumId"))
        if num_id is None or abs_ref is None:
            continue
        abs_id = abs_ref.get(qn("w:val"))
        overrides: Dict[int, int] = {}
        for ov in num.findall(qn("w:lvlOverride")):
            try:
                ov_ilvl = int(ov.get(qn("w:ilvl")) or 0)
            except Exception:
                continue
            so = ov.find(qn("w:startOverride"))
            if so is not None and so.get(qn("w:val")):
                try:
                    overrides[ov_ilvl] = int(so.get(qn("w:val")))
                except Exception:
                    pass
        for ilvl_int, (st, fmt, ltxt, is_lgl) in abs_map.get(abs_id, {}).items():
            lookup[(num_id, ilvl_int)] = (overrides.get(ilvl_int, st), fmt, ltxt, is_lgl)

    return lookup


def _build_style_numbering_lookup(doc: Document) -> Dict[str, Tuple[str, int]]:
    """Petakan styleId -> (numId, ilvl_int) termasuk pewarisan basedOn dari word/styles.xml."""
    raw_styles: Dict[str, Tuple[str, str, int | None]] = {}
    try:
        styles_el = doc.styles.element
    except Exception:
        return {}

    for st in styles_el.findall(qn("w:style")):
        sid = st.get(qn("w:styleId"))
        if not sid:
            continue
        based_el = st.find(qn("w:basedOn"))
        based_id = based_el.get(qn("w:val")) if based_el is not None else ""
        num_id = ""
        ilvl_val: int | None = None
        num_pr = st.find(f"{qn('w:pPr')}/{qn('w:numPr')}")
        if num_pr is not None:
            nid_el = num_pr.find(qn("w:numId"))
            ilv_el = num_pr.find(qn("w:ilvl"))
            if nid_el is not None and nid_el.get(qn("w:val")) is not None:
                num_id = str(nid_el.get(qn("w:val")))
            if ilv_el is not None and ilv_el.get(qn("w:val")) is not None:
                try:
                    ilvl_val = int(ilv_el.get(qn("w:val")))
                except Exception:
                    ilvl_val = 0
        raw_styles[sid] = (based_id or "", num_id, ilvl_val)

    resolved: Dict[str, Tuple[str, int]] = {}
    for sid in raw_styles:
        cur = sid
        seen = set()
        found_num_id = ""
        found_ilvl: int | None = None
        while cur and cur not in seen and cur in raw_styles:
            seen.add(cur)
            based_id, nid, ilv = raw_styles[cur]
            if not found_num_id and nid:
                found_num_id = nid
            if found_ilvl is None and ilv is not None:
                found_ilvl = ilv
            if found_num_id and found_ilvl is not None:
                break
            cur = based_id
        if found_num_id and found_num_id != "0":
            resolved[sid] = (found_num_id, found_ilvl if found_ilvl is not None else 0)
    return resolved


def _format_num_value(val: int, num_fmt: str) -> str:
    if val <= 0:
        val = 1
    if num_fmt == "upperRoman":
        return _to_roman(val, lower=False)
    if num_fmt == "lowerRoman":
        return _to_roman(val, lower=True)
    if num_fmt == "upperLetter":
        return chr(ord("A") + ((val - 1) % 26))
    if num_fmt == "lowerLetter":
        return chr(ord("a") + ((val - 1) % 26))
    return str(val)


def _merge_broken_bib_lines(entries: List[str]) -> List[str]:
    """Gabungkan entri Daftar Pustaka yang terputus baris di tengah akibat konversi PDF -> Word."""
    merged: List[str] = []
    for raw in entries:
        line = _clean_text(raw)
        if not line:
            continue
        plain = re.sub(r"<[^>]+>", "", line).strip()
        if not plain:
            continue
        if APPENDIX_RX.match(plain):
            break
        if merged:
            prev_plain = _strip_html_tags(merged[-1])
            has_year = bool(re.search(r"\b(?:19\d{2}|20\d{2}[a-z]?|n\.d\.)\b", plain, re.I))
            has_no_year = not has_year
            starts_with_author_particle = bool(
                re.match(r"^(?:van|von|de|del|di|la|le|da|dos|ten|ter)\s+[A-ZÀ-ÖØ-Þ]", plain) and has_year
            )
            prev_no_terminal = (not re.search(r"[.!?]$", prev_plain)) and (not re.search(r"https?://\S+$", prev_plain, re.I))
            is_cont_start = (not starts_with_author_particle) and bool(
                re.match(r"^[a-z]", plain)
                or re.match(r"^(?:https?://|www\.)", plain, re.I)
                or re.match(r"^\d+[\.\)\s]", plain)
                or re.match(r"^\(\d+\)", plain)
                or (has_no_year and prev_no_terminal)
            )
            prev_incomplete = (not starts_with_author_particle) and bool(re.search(r"[-–—,:]$", prev_plain))
            if is_cont_start or prev_incomplete:
                if re.search(r"[A-Za-z]-$", merged[-1]) and re.match(r"^[a-z]", plain):
                    merged[-1] = merged[-1][:-1] + line
                elif prev_plain.endswith(("–", "-")):
                    merged[-1] = merged[-1] + line
                else:
                    merged[-1] = merged[-1] + " " + line
                continue
        merged.append(line)
    return merged


def parse_docx_bytes(file_bytes: bytes, file_name: str = "dokumen.docx") -> Dict[str, Any]:
    doc = Document(io.BytesIO(file_bytes))
    num_lookup = _build_numbering_lookup(doc)
    style_num_lookup = _build_style_numbering_lookup(doc)

    # Deteksi keberadaan elemen kompleks (persamaan matematika OMML / footnote)
    body_xml = doc.element.body
    has_equations = any(True for _ in body_xml.iter("{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath"))
    has_footnotes = any(True for _ in body_xml.iter(qn("w:footnoteReference")))

    # 1. Kumpulkan item mentah sesuai urutan dokumen
    raw_items: List[Tuple[str, Any]] = []
    list_counters: Dict[str, Dict[int, int]] = {}
    current_bab_num = 0
    heading_num_ids = set()

    for block in _iter_body_blocks(doc):
        if isinstance(block, Paragraph):
            txt = _extract_paragraph_text_with_italics(block)
            imgs = _extract_images_from_paragraph(block, doc)

            # Cek apakah paragraf memakai numbering otomatis Word (langsung w:numPr atau turunan dari word/styles.xml)
            if txt:
                p_pr = block._element.find(qn("w:pPr"))
                num_pr = p_pr.find(qn("w:numPr")) if p_pr is not None else None
                p_style_el = p_pr.find(qn("w:pStyle")) if p_pr is not None else None
                style_id = p_style_el.get(qn("w:val")) if p_style_el is not None else ""

                resolved_num_id = "0"
                resolved_ilvl = 0
                if num_pr is not None:
                    num_id_el = num_pr.find(qn("w:numId"))
                    ilvl_el = num_pr.find(qn("w:ilvl"))
                    if num_id_el is not None and num_id_el.get(qn("w:val")) is not None:
                        resolved_num_id = str(num_id_el.get(qn("w:val")))
                    elif style_id in style_num_lookup:
                        resolved_num_id = style_num_lookup[style_id][0]
                    if ilvl_el is not None and ilvl_el.get(qn("w:val")) is not None:
                        try:
                            resolved_ilvl = int(ilvl_el.get(qn("w:val")) or 0)
                        except Exception:
                            resolved_ilvl = 0
                    elif style_id in style_num_lookup:
                        resolved_ilvl = style_num_lookup[style_id][1]
                elif style_id in style_num_lookup:
                    resolved_num_id, resolved_ilvl = style_num_lookup[style_id]

                is_manual_prefixed = bool(re.match(r"^(?:\d+(?:\.\d+)*[\.\)]?|[a-zA-Z][\.\)]|[-•*–—])\s+", _strip_html_tags(txt)))
                is_front_or_bib = bool(
                    FRONT_LIST_RX.match(_strip_html_tags(txt))
                    or PREFACE_RX.match(_strip_html_tags(txt))
                    or ABSTRACT_RX.match(_strip_html_tags(txt))
                    or BIB_RX.match(_strip_html_tags(txt))
                )
                if resolved_num_id and resolved_num_id != "0" and not is_manual_prefixed and not _is_real_bab_heading(txt) and not is_front_or_bib:
                    num_id = resolved_num_id
                    ilvl_int = resolved_ilvl
                    style_name = (block.style.name or "").lower() if block.style else ""
                    fallback_fmt = "bullet" if "bullet" in style_name else "decimal"
                    start_val, num_fmt, lvl_text, is_lgl = num_lookup.get(
                        (num_id, ilvl_int),
                        (1, fallback_fmt, f"%{ilvl_int + 1}.", False),
                    )
                    if num_fmt == "none":
                        pass
                    elif num_fmt == "bullet":
                        txt = f"- {txt}"
                    else:
                        counters = list_counters.setdefault(num_id, {})
                        for p_lvl in range(ilvl_int):
                            if p_lvl not in counters:
                                if p_lvl == 0 and current_bab_num > 0 and "%1" in lvl_text:
                                    counters[p_lvl] = current_bab_num
                                else:
                                    p_start = num_lookup.get((num_id, p_lvl), (1, "decimal", "%1.", False))[0]
                                    counters[p_lvl] = p_start

                        counters[ilvl_int] = counters.get(ilvl_int, start_val - 1) + 1
                        for deeper in [d for d in counters if d > ilvl_int]:
                            del counters[deeper]

                        def _replace_lvl_placeholder(match: re.Match) -> str:
                            lvl_idx = int(match.group(1)) - 1
                            lvl_fmt = num_lookup.get((num_id, lvl_idx), (1, num_fmt if lvl_idx == ilvl_int else "decimal", "", False))[1]
                            # Word <w:isLgl/> atau pola sub-bab "%1.%2" memaksa level induk memakai angka Arab (1.1, bukan I.1)
                            if is_lgl or (ilvl_int > 0 and lvl_idx == 0 and num_fmt == "decimal" and "%1." in lvl_text):
                                lvl_fmt = "decimal"
                            val = counters.get(lvl_idx)
                            if val is None:
                                if lvl_idx == 0 and current_bab_num > 0:
                                    val = current_bab_num
                                else:
                                    val = num_lookup.get((num_id, lvl_idx), (1, "decimal", "", False))[0]
                            return _format_num_value(val, lvl_fmt)

                        if re.search(r"%[1-9]", lvl_text):
                            marker = re.sub(r"%([1-9])", _replace_lvl_placeholder, lvl_text).strip()
                        else:
                            marker = f"{_format_num_value(counters[ilvl_int], num_fmt)}."

                        is_bab_marker = bool(BAB_RX.match(marker))
                        if not is_bab_marker and not marker.endswith((".", ")")) and "." not in marker:
                            marker = f"{marker}."

                        # Tangani artefak PDF: "Sistematika Penulisan BAB I : PENDAHULUAN" dalam 1 baris
                        sist_m = re.match(r"^(Sistematika\s+Penulisan)\s+((?:BAB|CHAPTH?ER)\s+[IVXLCDM0-9]+\s*:.+)$", txt, re.I)
                        if sist_m:
                            raw_items.append(("p", f"{marker} {sist_m.group(1).strip()}"))
                            txt = sist_m.group(2).strip()
                        else:
                            # Normalkan Shift+Enter (<w:br/>) di dalam item daftar bernomor agar tidak memutus daftar menjadi beberapa list 1., 1., 1.
                            if not is_bab_marker and "\n" in txt:
                                segs = [s.strip() for s in txt.splitlines() if s.strip()]
                                if len(segs) >= 2 and len(_strip_html_tags(segs[0])) <= 65 and not re.search(r"[.!?:;]$", _strip_html_tags(segs[0])):
                                    txt = f"{segs[0]}: {' '.join(segs[1:])}"
                                else:
                                    txt = " ".join(segs)
                            txt = f"{marker} {txt}"

                        if is_bab_marker:
                            heading_num_ids.add(num_id)
                            current_bab_num = _parse_bab_number(marker) or (current_bab_num + 1)
                            for other_id in [k for k in list_counters if k not in heading_num_ids]:
                                del list_counters[other_id]
                elif _is_real_bab_heading(txt):
                    new_bab = _parse_bab_number(txt) or (current_bab_num + 1)
                    keep_subbab = (
                        new_bab == 1
                        and current_bab_num == 0
                        and bool(raw_items)
                        and raw_items[-1][0] == "p"
                        and bool(re.match(r"^1\.\d+\s+\S+", str(raw_items[-1][1])))
                    )
                    current_bab_num = new_bab
                    if not keep_subbab:
                        for other_id in [k for k in list_counters if k not in heading_num_ids]:
                            del list_counters[other_id]

                raw_items.append(("p", txt))

            for src in imgs:
                raw_items.append(("img", src))

        elif isinstance(block, Table):
            rows = _extract_table_rows(block)
            if rows:
                raw_items.append(("table", rows))

    # 1b. Gabungkan tabel yang terpecah antar-halaman PDF dengan baris header berulang identik
    merged_raw_items: List[Tuple[str, Any]] = []
    for kind, val in raw_items:
        if kind == "table" and merged_raw_items and merged_raw_items[-1][0] == "table":
            prev_rows = merged_raw_items[-1][1]
            if prev_rows and val and len(prev_rows[0]) == len(val[0]):
                hdr1 = [_clean_text(c).lower() for c in prev_rows[0]]
                hdr2 = [_clean_text(c).lower() for c in val[0]]
                if hdr1 == hdr2 and len(val) > 1:
                    merged_raw_items[-1] = ("table", prev_rows + val[1:])
                    continue
        merged_raw_items.append((kind, val))
    raw_items = merged_raw_items

    # 2. Pasangkan caption Gambar/Tabel dan baris Sumber
    consumed = set()
    images: Dict[str, str] = {}
    img_counter = 0
    emitted: List[Tuple[str, str]] = []

    for i, (kind, val) in enumerate(raw_items):
        if i in consumed:
            continue

        if kind == "img":
            title = ""
            source = ""
            if emitted and emitted[-1][0] == "p":
                m = FIG_CAP_RX.match(emitted[-1][1])
                if m:
                    title = m.group(1).strip()
                    emitted.pop()

            nxt = i + 1
            if not title and nxt < len(raw_items) and raw_items[nxt][0] == "p":
                m = FIG_CAP_RX.match(raw_items[nxt][1])
                if m:
                    title = m.group(1).strip()
                    consumed.add(nxt)
                    nxt += 1

            if nxt < len(raw_items) and raw_items[nxt][0] == "p":
                m = SRC_RX.match(raw_items[nxt][1])
                if m:
                    source = m.group(1).strip()
                    consumed.add(nxt)

            img_counter += 1
            img_id = f"img_docx_{img_counter}"
            images[img_id] = val
            safe_title = _sanitize_attr(title or f"Gambar {img_counter}")
            src_attr = f' sumber="{_sanitize_attr(source)}"' if source else ""
            emitted.append(("tag", f'[GAMBAR id="{img_id}" judul="{safe_title}"{src_attr} lebar="85"]'))
            continue

        if kind == "table":
            title = ""
            source = ""
            if emitted and emitted[-1][0] == "p":
                m = TBL_CAP_RX.match(emitted[-1][1])
                if m:
                    title = m.group(1).strip()
                    emitted.pop()

            nxt = i + 1
            if not title and nxt < len(raw_items) and raw_items[nxt][0] == "p":
                m = TBL_CAP_RX.match(raw_items[nxt][1])
                if m:
                    title = m.group(1).strip()
                    consumed.add(nxt)
                    nxt += 1

            if nxt < len(raw_items) and raw_items[nxt][0] == "p":
                m = SRC_RX.match(raw_items[nxt][1])
                if m:
                    source = m.group(1).strip()
                    consumed.add(nxt)

            safe_title = _sanitize_attr(title or f"Tabel {len([1 for k, v in emitted if k == 'tag' and v.startswith('[TABEL')]) + 1}")
            src_attr = f' sumber="{_sanitize_attr(source)}"' if source else ""
            row_lines = "\n".join(" | ".join(r) for r in val)
            emitted.append(("tag", f'[TABEL judul="{safe_title}"{src_attr}]\n{row_lines}\n[/TABEL]'))
            continue

        emitted.append(("p", str(val)))

    # 3. Pisahkan Cover Title (+ Logo & Identitas Cover), Kata Pengantar, Isi BAB, Daftar Pustaka, dan Lampiran
    def _extract_cover_meta(cover_lines: List[str]) -> Dict[str, str]:
        meta = {"subtitle": "", "lecturer": "", "authors": "", "prodi": "", "university": "", "year": ""}
        if not cover_lines:
            return meta
        sub_parts: List[str] = []
        author_lines: List[str] = []
        prodi_lines: List[str] = []
        univ_lines: List[str] = []
        sec = ""
        for raw in cover_lines:
            line = re.sub(r"\s+", " ", raw).strip()
            if not line:
                continue
            if re.match(r"^(?:19|20)\d{2}$", line):
                meta["year"] = line
                sec = ""
                continue
            if re.match(r"^(?:PROGRAM\s+STUDI|PRODI|JURUSAN|FAKULTAS|DEPARTEMEN|FACULTY|DEPARTMENT|ENGLISH\s+EDUCATION)\b", line, re.I):
                prodi_lines.append(line)
                sec = ""
                continue
            if re.match(r"^(?:UNIVERSITAS|INSTITUT|POLITEKNIK|SEKOLAH\s+TINGGI|UIN\b|IAIN\b|STMIK\b|UNIVERSITY)\b", line, re.I):
                univ_lines.append(line)
                sec = ""
                continue
            if re.match(r"^(?:KOTA\s+)?(?:PALU|MEDAN|SERANG|JAKARTA|BANDUNG|SEMARANG|SURABAYA|YOGYAKARTA|PEKALONGAN|MAKASSAR|MALANG|TANGERANG)$", line, re.I):
                sec = ""
                continue
            lec_m = re.match(r"^(?:Dosen\s+Pengampu|Pembimbing)\s*[:\-–—]?\s*(.*)$", line, re.I)
            if lec_m:
                val = lec_m.group(1).strip()
                if val:
                    meta["lecturer"] = val
                    sec = ""
                else:
                    sec = "lecturer"
                continue
            by_m = re.match(r"^(?:Disusun\s+Oleh|Oleh|By)\s*[:\-–—]?\s*(.*)$", line, re.I)
            if by_m:
                val = by_m.group(1).strip()
                if val:
                    author_lines.append(val)
                sec = "authors"
                continue
            if re.match(r"^(?:Disusun\s+untuk|Diajukan\s+untuk|Makalah\s+ini\s+disusun|Submitted\s+to)\b", line, re.I):
                sub_parts.append(line)
                sec = "subtitle"
                continue
            if sec == "lecturer" and not meta["lecturer"]:
                meta["lecturer"] = line
                sec = ""
                continue
            if sec == "subtitle":
                if len(sub_parts) < 3 and len(line) <= 100:
                    sub_parts.append(line)
                    continue
                sec = ""
            if sec == "authors":
                is_id_line = bool(re.match(r"^(?:\(?\d{6,16}\)?|(?:NIM|NPM|NRP|STB)\.?[\s:]*[A-Z0-9\s\-]{4,20}|[A-Z]\s?\d{3}\s?\d{2}\s?\d{3,4})$", line, re.I))
                is_class_code = bool(re.match(r"^[0-9A-Z]{6,12}$", line) and any(c.isdigit() for c in line) and any(c.isalpha() for c in line))
                if is_id_line and author_lines and "(" not in author_lines[-1]:
                    clean_id = line.strip("() ").strip()
                    author_lines[-1] = f"{author_lines[-1]} ({clean_id})"
                elif is_class_code:
                    continue
                elif len(author_lines) < 8:
                    author_lines.append(line)
                continue
        meta["subtitle"] = " ".join(sub_parts).strip()
        meta["authors"] = "\n".join(author_lines).strip()
        meta["prodi"] = "\n".join(prodi_lines).strip()
        meta["university"] = "\n".join(univ_lines).strip()
        return meta

    def _next_emitted_p(idx: int) -> str:
        for j in range(idx + 1, len(emitted)):
            if emitted[j][0] == "p" and emitted[j][1].strip():
                return emitted[j][1]
        return ""

    first_bab_idx = next(
        (idx for idx, (k, v) in enumerate(emitted) if k == "p" and _is_real_bab_heading(v, _next_emitted_p(idx))),
        -1,
    )
    # Jika akibat convert PDF ada sub-bab "1.1 Latar Belakang" tepat sebelum "BAB I ...", tukar ke sesudah BAB I
    if first_bab_idx > 0 and emitted[first_bab_idx - 1][0] == "p":
        prev_v = emitted[first_bab_idx - 1][1]
        if re.match(r"^\d+\.\d+(?:\.\d+)*\.?\s+\S+", prev_v) and len(prev_v) <= 130:
            bab_item = emitted[first_bab_idx]
            emitted[first_bab_idx - 1] = bab_item
            emitted[first_bab_idx] = ("p", prev_v)
            first_bab_idx -= 1

    bib_idx = next(
        (idx for idx, (k, v) in enumerate(emitted) if k == "p" and BIB_RX.match(_strip_html_tags(v)) and idx > max(0, first_bab_idx)),
        -1,
    )

    suggested_title = ""
    cover_logo_data_url = ""
    abstract_body = ""
    abstract_keywords = ""
    preface_body = ""
    bibliography = ""

    content_end_idx = len(emitted)
    if bib_idx != -1:
        content_end_idx = bib_idx
        bib_candidates: List[str] = []
        for k, v in emitted[bib_idx + 1 :]:
            if k == "p":
                plain_v = _strip_html_tags(v)
                if APPENDIX_RX.match(plain_v):
                    break
                if v:
                    bib_candidates.append(v)
        bibliography = "\n".join(_merge_broken_bib_lines(bib_candidates))

    body_start_idx = 0
    cover_lines: List[str] = []
    if first_bab_idx > 0:
        mode = "cover"
        abstract_paras: List[str] = []
        preface_paras: List[str] = []
        for k, v in emitted[:first_bab_idx]:
            if k == "tag" and mode == "cover" and not cover_logo_data_url:
                gm = re.match(r'^\[GAMBAR\s+id="(img_docx_\d+)"', v, re.I)
                if gm:
                    cover_logo_data_url = images.pop(gm.group(1), "")
                continue
            if k != "p":
                continue
            plain_v = re.sub(r"\s+", " ", _strip_html_tags(v)).strip()
            if ABSTRACT_RX.match(plain_v):
                mode = "abstract"
                continue
            if PREFACE_RX.match(plain_v):
                mode = "preface"
                continue
            if FRONT_LIST_RX.match(plain_v):
                mode = "front_list"
                continue
            if (
                mode == "cover"
                and not suggested_title
                and not GENERIC_COVER_HEADER_RX.match(plain_v)
                and 10 <= len(plain_v) <= 240
            ):
                suggested_title = plain_v.upper()
            elif mode == "cover":
                cover_lines.append(plain_v)
            elif mode == "abstract":
                kw_m = KEYWORDS_RX.match(plain_v)
                if kw_m:
                    abstract_keywords = kw_m.group(1).strip()
                else:
                    abstract_paras.append(v)
            elif mode == "preface":
                preface_paras.append(v)
        if abstract_paras:
            abstract_body = "\n\n".join(abstract_paras)
        if preface_paras:
            preface_body = "\n\n".join(preface_paras)
        body_start_idx = first_bab_idx
    elif emitted and emitted[0][0] == "p":
        first_line = re.sub(r"\s+", " ", _strip_html_tags(emitted[0][1])).strip()
        if (
            not _is_real_bab_heading(first_line)
            and not PREFACE_RX.match(first_line)
            and not GENERIC_COVER_HEADER_RX.match(first_line)
            and 10 <= len(first_line) <= 220
        ):
            suggested_title = first_line.upper()

    cover_meta = _extract_cover_meta(cover_lines)

    if not suggested_title:
        base_name = re.sub(r"\.[^.]+$", "", file_name or "MAKALAH AKADEMIK")
        suggested_title = re.sub(r"[_-]+", " ", base_name).strip().upper()

    list_item_rx = re.compile(r"^(?:[-•*–—]|\d+[\.\)]|[a-z][\.\)])\s+")
    subbab_rx = re.compile(r"^(?:[A-Z]\.\s+|\d+\.\d+(?:\.\d+)*\.?\s+)\S+")

    def _is_plain_prose(kind: str, val: str) -> bool:
        if kind != "p":
            return False
        s = _strip_html_tags(val)
        if not s or BAB_RX.match(s) or SISTEMATIKA_BAB_RX.match(s):
            return False
        if list_item_rx.match(s) or subbab_rx.match(s) or FRONT_LIST_RX.match(s):
            return False
        if FIG_CAP_RX.match(s) or TBL_CAP_RX.match(s) or SRC_RX.match(s):
            return False
        if len(s) <= 85 and not re.search(r"[.!?\"”)]$", s) and "\n" not in s and len(s.split()) <= 8:
            # Berpotensi sub-judul tanpa nomor (mis. "Metode Penelitian")
            return False
        return True

    def _norm_subbab_key(val: str) -> str:
        plain = _strip_html_tags(val)
        m = re.match(r"^(\d+(?:\.\d+)+)\.?(\s+.+)$", plain)
        if not m:
            return ""
        title_norm = re.sub(r"\s+", " ", m.group(2)).strip().lower()
        return f"{m.group(1)} {title_norm}"

    def _merge_broken_paragraphs(blocks: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
        # 1. Deduplikasi sub-bab ganda berturut-turut (mis. "2.2. KAJIAN EMPIRIS" lalu "2.2 Kajian Empiris")
        deduped: List[Tuple[str, str]] = []
        for k, v in blocks:
            if k == "p" and deduped and deduped[-1][0] == "p" and subbab_rx.match(_strip_html_tags(v)):
                cur_key = _norm_subbab_key(v)
                prev_key = _norm_subbab_key(deduped[-1][1])
                if cur_key and cur_key == prev_key:
                    # Pertahankan versi yang lebih rapi (Title Case / tanpa titik ganda setelah angka)
                    prev_plain = _strip_html_tags(deduped[-1][1])
                    cur_plain = _strip_html_tags(v)
                    if prev_plain.isupper() and not cur_plain.isupper():
                        deduped[-1] = (k, v)
                    continue
            deduped.append((k, v))

        # 2. Gabungkan paragraf yang terbelah oleh baris kosong atau terselip blok [TABEL] di tengah kalimat
        merged: List[Tuple[str, str]] = []
        for k, v in deduped:
            if merged and _is_plain_prose(*merged[-1]) and _is_plain_prose(k, v):
                prev_plain = _strip_html_tags(merged[-1][1])
                curr_plain = _strip_html_tags(v)
                if (
                    len(prev_plain) >= 40
                    and not re.search(r'[.!?:"”)\]]$', prev_plain)
                    and re.match(r"^[a-z]", curr_plain)
                ):
                    if re.search(r"[A-Za-z]-$", merged[-1][1]) and re.match(r"^[a-z]", v):
                        merged[-1] = ("p", merged[-1][1][:-1] + v)
                    else:
                        merged[-1] = ("p", merged[-1][1] + " " + v)
                    continue
            # Tangani pola: [paragraf_terpotong, [TABEL], lanjutan_kalimat_huruf_kecil]
            if (
                len(merged) >= 2
                and merged[-1][0] == "tag"
                and merged[-1][1].startswith("[TABEL")
                and _is_plain_prose(*merged[-2])
                and _is_plain_prose(k, v)
            ):
                prev_plain = _strip_html_tags(merged[-2][1])
                curr_plain = _strip_html_tags(v)
                if (
                    len(prev_plain) >= 40
                    and not re.search(r'[.!?:"”)\]]$', prev_plain)
                    and re.match(r"^[a-z]", curr_plain)
                ):
                    if re.search(r"[A-Za-z]-$", merged[-2][1]) and re.match(r"^[a-z]", v):
                        merged[-2] = ("p", merged[-2][1][:-1] + v)
                    else:
                        merged[-2] = ("p", merged[-2][1] + " " + v)
                    continue
            merged.append((k, v))
        return merged

    def _join_blocks(blocks: List[Tuple[str, str]]) -> str:
        parts: List[str] = []
        prev_is_list = False
        for k, v in blocks:
            cur_is_list = (k == "p") and bool(list_item_rx.match(v))
            if parts:
                parts.append("\n" if (prev_is_list and cur_is_list) else "\n\n")
            parts.append(v)
            prev_is_list = cur_is_list
        return "".join(parts).strip()

    body_blocks = _merge_broken_paragraphs(emitted[body_start_idx:content_end_idx])
    body_text = _join_blocks(body_blocks)
    raw_preview_text = _join_blocks(emitted)
    final_body = body_text or raw_preview_text

    table_count = sum(1 for k, v in body_blocks if k == "tag" and v.startswith("[TABEL"))
    figure_count = sum(1 for k, v in body_blocks if k == "tag" and v.startswith("[GAMBAR"))

    full_words_text = " ".join(x for x in [preface_body, final_body, bibliography] if x)
    word_count = len([w for w in re.split(r"\s+", full_words_text) if w])
    final_lines = [l.strip() for l in final_body.splitlines()]
    bab_count = 0
    for idx, line in enumerate(final_lines):
        cleaned_l = re.sub(r"^(?:#+\s*)?(?:\*\*|__)?\s*", "", line)
        if not cleaned_l:
            continue
        nxt_l = next((final_lines[j] for j in range(idx + 1, len(final_lines)) if final_lines[j]), "")
        if _is_real_bab_heading(cleaned_l, nxt_l):
            bab_count += 1

    return {
        "engine": "python-docx",
        "fileName": file_name,
        "bodyText": final_body,
        "rawPreviewText": raw_preview_text,
        "suggestedTitle": suggested_title,
        "coverMeta": cover_meta,
        "coverLogoDataUrl": cover_logo_data_url,
        "abstractBody": abstract_body,
        "abstractKeywords": abstract_keywords,
        "prefaceBody": preface_body,
        "bibliography": bibliography,
        "images": images,
        "wordCount": word_count,
        "babCount": bab_count,
        "tableCount": table_count,
        "figureCount": figure_count,
        "hasEquations": has_equations,
        "hasFootnotes": has_footnotes,
    }

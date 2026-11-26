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

BAB_RX = re.compile(r"^BAB\s+[IVXLCDM0-9]+\b", re.I)
SISTEMATIKA_BAB_RX = re.compile(r"^BAB\s+[IVXLCDM0-9]+\s*:", re.I)
GENERIC_COVER_HEADER_RX = re.compile(
    r"^(?:MAKALAH|USULAN\s+PENELITIAN|PROPOSAL(?:\s+(?:SKRIPSI|PENELITIAN|TESIS))?|SKRIPSI|TESIS|DISERTASI|LAPORAN(?:\s+\w+){0,2}|KARYA\s+TULIS\s+ILMIAH)$",
    re.I,
)
APPENDIX_RX = re.compile(
    r"^(?:LAMPIRAN(?:\s+[IVXLCDM0-9A-Z]+)?|KUESIONER(?:\s+PENELITIAN)?|INSTRUMEN\s+PENELITIAN|PEDOMAN\s+WAWANCARA|RIWAYAT\s+HIDUP|BIODATA(?:\s+PENULIS)?)\b",
    re.I,
)
ABSTRACT_RX = re.compile(r"^(?:ABSTRAK|ABSTRACT|INTISARI)$", re.I)
KEYWORDS_RX = re.compile(r"^(?:Kata\s+Kunci|Keywords?)\s*[:\-–—]\s*(.+)$", re.I)
PREFACE_RX = re.compile(r"^(?:KATA\s+PENGANTAR|PRAKATA)$", re.I)
FRONT_LIST_RX = re.compile(r"^(?:DAFTAR\s+ISI|DAFTAR\s+TABEL|DAFTAR\s+GAMBAR)$", re.I)
BIB_RX = re.compile(r"^(?:DAFTAR\s+PUSTAKA|REFERENSI|BIBLIOGRAFI)$", re.I)

ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def _is_real_bab_heading(line: str) -> bool:
    t = _clean_text(line)
    if not t or len(t) > 120:
        return False
    return bool(BAB_RX.match(t)) and not bool(SISTEMATIKA_BAB_RX.match(t))


def _parse_bab_number(line: str) -> int:
    m = re.match(r"^BAB\s+([IVXLCDM]+|\d+)\b", _clean_text(line), re.I)
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
    return re.sub(r"[ \t]+", " ", str(val or "").replace("\u00A0", " ")).strip()


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
        t = str(r.text or "").replace("\u00A0", " ")
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


def _iter_body_blocks(doc: Document):
    """Iterasi paragraf dan tabel secara berurutan sesuai posisi asli di word/document.xml."""
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def _build_numbering_lookup(doc: Document) -> Dict[Tuple[str, int], Tuple[int, str, str]]:
    """Petakan (numId, ilvl_int) -> (start_val, numFmt, lvlText) dari word/numbering.xml untuk penomoran otomatis & bertingkat."""
    lookup: Dict[Tuple[str, int], Tuple[int, str, str]] = {}
    try:
        num_el = doc.part.numbering_part._element
    except Exception:
        return lookup

    abs_map: Dict[str, Dict[int, Tuple[int, str, str]]] = {}
    for abs_num in num_el.findall(qn("w:abstractNum")):
        abs_id = abs_num.get(qn("w:abstractNumId"))
        if abs_id is None:
            continue
        lvls: Dict[int, Tuple[int, str, str]] = {}
        for lvl in abs_num.findall(qn("w:lvl")):
            ilvl_int = int(lvl.get(qn("w:ilvl")) or 0)
            st_el = lvl.find(qn("w:start"))
            fmt_el = lvl.find(qn("w:numFmt"))
            txt_el = lvl.find(qn("w:lvlText"))
            try:
                start_val = int(st_el.get(qn("w:val"))) if (st_el is not None and st_el.get(qn("w:val"))) else 1
            except Exception:
                start_val = 1
            fmt = fmt_el.get(qn("w:val")) if fmt_el is not None else "decimal"
            ltxt = txt_el.get(qn("w:val")) if txt_el is not None else f"%{ilvl_int + 1}."
            lvls[ilvl_int] = (start_val, fmt, ltxt)
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
        for ilvl_int, (st, fmt, ltxt) in abs_map.get(abs_id, {}).items():
            lookup[(num_id, ilvl_int)] = (overrides.get(ilvl_int, st), fmt, ltxt)

    return lookup


def _format_num_value(val: int, num_fmt: str) -> str:
    if val <= 0:
        val = 1
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
            prev_plain = re.sub(r"<[^>]+>", "", merged[-1]).strip()
            has_no_year = not re.search(r"\b(?:19\d{2}|20\d{2}[a-z]?|n\.d\.)\b", plain, re.I)
            prev_no_terminal = (not re.search(r"[.!?]$", prev_plain)) and (not re.search(r"https?://\S+$", prev_plain, re.I))
            is_cont_start = bool(
                re.match(r"^[a-z]", plain)
                or re.match(r"^(?:https?://|www\.)", plain, re.I)
                or re.match(r"^\d+[\.\)\s]", plain)
                or re.match(r"^\(\d+\)", plain)
                or (has_no_year and prev_no_terminal)
            )
            prev_incomplete = bool(re.search(r"[-–—,:]$", prev_plain))
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

    # Deteksi keberadaan elemen kompleks (persamaan matematika OMML / footnote)
    body_xml = doc.element.body
    has_equations = any(True for _ in body_xml.iter("{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath"))
    has_footnotes = any(True for _ in body_xml.iter(qn("w:footnoteReference")))

    # 1. Kumpulkan item mentah sesuai urutan dokumen
    raw_items: List[Tuple[str, Any]] = []
    list_counters: Dict[str, Dict[int, int]] = {}
    current_bab_num = 0

    for block in _iter_body_blocks(doc):
        if isinstance(block, Paragraph):
            txt = _extract_paragraph_text_with_italics(block)
            imgs = _extract_images_from_paragraph(block, doc)

            # Cek apakah paragraf memakai numbering otomatis Word (w:numPr)
            if txt:
                num_pr = block._element.find(f".//{qn('w:numPr')}")
                is_manual_prefixed = bool(re.match(r"^(?:\d+(?:\.\d+)*[\.\)]?|[a-zA-Z][\.\)]|[-•*–—])\s+", txt))
                if num_pr is not None and not is_manual_prefixed and not _is_real_bab_heading(txt):
                    num_id_el = num_pr.find(qn("w:numId"))
                    ilvl_el = num_pr.find(qn("w:ilvl"))
                    num_id = num_id_el.get(qn("w:val")) if num_id_el is not None else "0"
                    try:
                        ilvl_int = int(ilvl_el.get(qn("w:val")) or 0) if ilvl_el is not None else 0
                    except Exception:
                        ilvl_int = 0

                    if num_id and num_id != "0":
                        style_name = (block.style.name or "").lower() if block.style else ""
                        fallback_fmt = "bullet" if "bullet" in style_name else "decimal"
                        start_val, num_fmt, lvl_text = num_lookup.get(
                            (num_id, ilvl_int),
                            (1, fallback_fmt, f"%{ilvl_int + 1}."),
                        )
                        if num_fmt == "bullet":
                            txt = f"- {txt}"
                        else:
                            counters = list_counters.setdefault(num_id, {})
                            for p_lvl in range(ilvl_int):
                                if p_lvl not in counters:
                                    if p_lvl == 0 and current_bab_num > 0 and "%1" in lvl_text:
                                        counters[p_lvl] = current_bab_num
                                    else:
                                        p_start = num_lookup.get((num_id, p_lvl), (1, "decimal", "%1."))[0]
                                        counters[p_lvl] = p_start

                            counters[ilvl_int] = counters.get(ilvl_int, start_val - 1) + 1
                            for deeper in [d for d in counters if d > ilvl_int]:
                                del counters[deeper]

                            def _replace_lvl_placeholder(match: re.Match) -> str:
                                lvl_idx = int(match.group(1)) - 1
                                lvl_fmt = num_lookup.get((num_id, lvl_idx), (1, num_fmt if lvl_idx == ilvl_int else "decimal", ""))[1]
                                val = counters.get(lvl_idx)
                                if val is None:
                                    if lvl_idx == 0 and current_bab_num > 0:
                                        val = current_bab_num
                                    else:
                                        val = num_lookup.get((num_id, lvl_idx), (1, "decimal", ""))[0]
                                return _format_num_value(val, lvl_fmt)

                            if re.search(r"%[1-9]", lvl_text):
                                marker = re.sub(r"%([1-9])", _replace_lvl_placeholder, lvl_text).strip()
                            else:
                                marker = f"{_format_num_value(counters[ilvl_int], num_fmt)}."

                            if not marker.endswith((".", ")")) and "." not in marker:
                                marker = f"{marker}."

                            # Tangani artefak PDF: "Sistematika Penulisan BAB I : PENDAHULUAN" dalam 1 baris
                            sist_m = re.match(r"^(Sistematika\s+Penulisan)\s+(BAB\s+[IVXLCDM0-9]+\s*:.+)$", txt, re.I)
                            if sist_m:
                                raw_items.append(("p", f"{marker} {sist_m.group(1).strip()}"))
                                txt = sist_m.group(2).strip()
                            else:
                                txt = f"{marker} {txt}"
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
                            list_counters.clear()
                else:
                    if _is_real_bab_heading(txt):
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
                            list_counters.clear()

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

    # 3. Pisahkan Cover Title (+ Logo), Kata Pengantar, Isi BAB, Daftar Pustaka, dan Lampiran
    first_bab_idx = next((idx for idx, (k, v) in enumerate(emitted) if k == "p" and _is_real_bab_heading(v)), -1)
    # Jika akibat convert PDF ada sub-bab "1.1 Latar Belakang" tepat sebelum "BAB I ...", tukar ke sesudah BAB I
    if first_bab_idx > 0 and emitted[first_bab_idx - 1][0] == "p":
        prev_v = emitted[first_bab_idx - 1][1]
        if re.match(r"^\d+\.\d+(?:\.\d+)*\.?\s+\S+", prev_v) and len(prev_v) <= 130:
            bab_item = emitted[first_bab_idx]
            emitted[first_bab_idx - 1] = bab_item
            emitted[first_bab_idx] = ("p", prev_v)
            first_bab_idx -= 1

    bib_idx = next(
        (idx for idx, (k, v) in enumerate(emitted) if k == "p" and BIB_RX.match(v) and idx > max(0, first_bab_idx)),
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
                plain_v = re.sub(r"<[^>]+>", "", v).strip()
                if APPENDIX_RX.match(plain_v):
                    break
                if v:
                    bib_candidates.append(v)
        bibliography = "\n".join(_merge_broken_bib_lines(bib_candidates))

    body_start_idx = 0
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
            if ABSTRACT_RX.match(v):
                mode = "abstract"
                continue
            if PREFACE_RX.match(v):
                mode = "preface"
                continue
            if FRONT_LIST_RX.match(v):
                mode = "front_list"
                continue
            if (
                mode == "cover"
                and not suggested_title
                and not GENERIC_COVER_HEADER_RX.match(v)
                and 10 <= len(v) <= 220
            ):
                suggested_title = v.upper()
            elif mode == "abstract":
                kw_m = KEYWORDS_RX.match(v)
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
        first_line = emitted[0][1]
        if (
            not _is_real_bab_heading(first_line)
            and not PREFACE_RX.match(first_line)
            and not GENERIC_COVER_HEADER_RX.match(first_line)
            and 10 <= len(first_line) <= 180
        ):
            suggested_title = first_line.upper()

    if not suggested_title:
        base_name = re.sub(r"\.[^.]+$", "", file_name or "MAKALAH AKADEMIK")
        suggested_title = re.sub(r"[_-]+", " ", base_name).strip().upper()

    list_item_rx = re.compile(r"^(?:[-•*–—]|\d+[\.\)]|[a-z][\.\)])\s+")
    subbab_rx = re.compile(r"^(?:[A-Z]\.\s+|\d+\.\d+(?:\.\d+)*\.?\s+)\S+")

    def _is_plain_prose(kind: str, val: str) -> bool:
        if kind != "p":
            return False
        s = re.sub(r"<[^>]+>", "", val).strip()
        if not s or _is_real_bab_heading(s) or SISTEMATIKA_BAB_RX.match(s):
            return False
        if list_item_rx.match(s) or subbab_rx.match(s) or FRONT_LIST_RX.match(s):
            return False
        if FIG_CAP_RX.match(s) or TBL_CAP_RX.match(s) or SRC_RX.match(s):
            return False
        if len(s) <= 85 and not re.search(r"[.!?\"”)]$", s) and "\n" not in s and len(s.split()) <= 8:
            # Berpotensi sub-judul tanpa nomor (mis. "Metode Penelitian")
            return False
        return True

    def _merge_broken_paragraphs(blocks: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
        merged: List[Tuple[str, str]] = []
        for k, v in blocks:
            if merged and _is_plain_prose(*merged[-1]) and _is_plain_prose(k, v):
                prev_plain = re.sub(r"<[^>]+>", "", merged[-1][1]).strip()
                curr_plain = re.sub(r"<[^>]+>", "", v).strip()
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
    bab_count = sum(1 for line in final_body.splitlines() if _is_real_bab_heading(re.sub(r"^(?:#+\s*)?(?:\*\*|__)?\s*", "", line)))

    return {
        "engine": "python-docx",
        "fileName": file_name,
        "bodyText": final_body,
        "rawPreviewText": raw_preview_text,
        "suggestedTitle": suggested_title,
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

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

FIG_CAP_RX = re.compile(r"^(?:Gambar|Gbr\.?|Figure|Fig\.?)\s*\d*(?:\.\d+)*\s*[:.\-\u2013\u2014]?\s*(.+)$", re.I)
TBL_CAP_RX = re.compile(r"^(?:Tabel|Tbl\.?|Table)\s*\d*(?:\.\d+)*\s*[:.\-\u2013\u2014]?\s*(.+)$", re.I)
SRC_RX = re.compile(r"^Sumber\s*[:\-\u2013\u2014]\s*(.+)$", re.I)

BAB_RX = re.compile(r"^BAB\s+[IVXLCDM0-9]+\b", re.I)
ABSTRACT_RX = re.compile(r"^(?:ABSTRAK|ABSTRACT|INTISARI)$", re.I)
KEYWORDS_RX = re.compile(r"^(?:Kata\s+Kunci|Keywords?)\s*[:\-–—]\s*(.+)$", re.I)
PREFACE_RX = re.compile(r"^(?:KATA\s+PENGANTAR|PRAKATA)$", re.I)
FRONT_LIST_RX = re.compile(r"^(?:DAFTAR\s+ISI|DAFTAR\s+TABEL|DAFTAR\s+GAMBAR)$", re.I)
BIB_RX = re.compile(r"^(?:DAFTAR\s+PUSTAKA|REFERENSI|BIBLIOGRAFI)$", re.I)

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


def _build_numbering_lookup(doc: Document) -> Dict[Tuple[str, str], Tuple[str, str]]:
    """Petakan (numId, ilvl) -> (numFmt, lvlText) dari word/numbering.xml untuk membaca penomoran otomatis Word."""
    lookup: Dict[Tuple[str, str], Tuple[str, str]] = {}
    try:
        num_el = doc.part.numbering_part._element
    except Exception:
        return lookup

    abs_map: Dict[str, Dict[str, Tuple[str, str]]] = {}
    for abs_num in num_el.findall(qn("w:abstractNum")):
        abs_id = abs_num.get(qn("w:abstractNumId"))
        if abs_id is None:
            continue
        lvls: Dict[str, Tuple[str, str]] = {}
        for lvl in abs_num.findall(qn("w:lvl")):
            ilvl = lvl.get(qn("w:ilvl")) or "0"
            fmt_el = lvl.find(qn("w:numFmt"))
            txt_el = lvl.find(qn("w:lvlText"))
            fmt = fmt_el.get(qn("w:val")) if fmt_el is not None else "decimal"
            ltxt = txt_el.get(qn("w:val")) if txt_el is not None else "%1."
            lvls[ilvl] = (fmt, ltxt)
        abs_map[abs_id] = lvls

    for num in num_el.findall(qn("w:num")):
        num_id = num.get(qn("w:numId"))
        abs_ref = num.find(qn("w:abstractNumId"))
        if num_id is None or abs_ref is None:
            continue
        abs_id = abs_ref.get(qn("w:val"))
        for ilvl, pair in abs_map.get(abs_id, {}).items():
            lookup[(num_id, ilvl)] = pair

    return lookup


def _format_num_value(val: int, num_fmt: str) -> str:
    if num_fmt == "upperLetter":
        return chr(ord("A") + ((val - 1) % 26))
    if num_fmt == "lowerLetter":
        return chr(ord("a") + ((val - 1) % 26))
    return str(val)


def parse_docx_bytes(file_bytes: bytes, file_name: str = "dokumen.docx") -> Dict[str, Any]:
    doc = Document(io.BytesIO(file_bytes))
    num_lookup = _build_numbering_lookup(doc)

    # Deteksi keberadaan elemen kompleks (persamaan matematika OMML / footnote)
    body_xml = doc.element.body
    has_equations = any(True for _ in body_xml.iter("{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath"))
    has_footnotes = any(True for _ in body_xml.iter(qn("w:footnoteReference")))

    # 1. Kumpulkan item mentah sesuai urutan dokumen
    raw_items: List[Tuple[str, Any]] = []
    list_counters: Dict[str, int] = {}

    for block in _iter_body_blocks(doc):
        if isinstance(block, Paragraph):
            txt = _extract_paragraph_text_with_italics(block)
            imgs = _extract_images_from_paragraph(block, doc)

            # Cek apakah paragraf memakai numbering otomatis Word (w:numPr)
            if txt:
                num_pr = block._element.find(f".//{qn('w:numPr')}")
                if num_pr is not None and not re.match(r"^(?:\d+(?:\.\d+)*[\.\)]?|[a-zA-Z][\.\)]|[-•*–—])\s+", txt):
                    num_id_el = num_pr.find(qn("w:numId"))
                    ilvl_el = num_pr.find(qn("w:ilvl"))
                    num_id = num_id_el.get(qn("w:val")) if num_id_el is not None else "0"
                    ilvl = ilvl_el.get(qn("w:val")) if ilvl_el is not None else "0"
                    style_name = (block.style.name or "").lower() if block.style else ""
                    num_fmt, lvl_text = num_lookup.get((num_id, ilvl), ("bullet" if "bullet" in style_name else "decimal", "%1."))
                    if num_fmt == "bullet":
                        txt = f"- {txt}"
                    else:
                        key = f"{num_id}:{ilvl}"
                        list_counters[key] = list_counters.get(key, 0) + 1
                        formatted_n = _format_num_value(list_counters[key], num_fmt)
                        marker = lvl_text.replace("%1", formatted_n) if "%1" in lvl_text else f"{formatted_n}."
                        txt = f"{marker} {txt}"
                else:
                    if BAB_RX.match(txt):
                        list_counters.clear()

                raw_items.append(("p", txt))

            for src in imgs:
                raw_items.append(("img", src))

        elif isinstance(block, Table):
            rows = _extract_table_rows(block)
            if rows:
                raw_items.append(("table", rows))

    # 2. Pasangkan caption Gambar/Tabel dan baris Sumber
    consumed = set()
    images: Dict[str, str] = {}
    img_counter = 0
    table_count = 0
    figure_count = 0
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
            figure_count += 1
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

            table_count += 1
            safe_title = _sanitize_attr(title or f"Tabel {table_count}")
            src_attr = f' sumber="{_sanitize_attr(source)}"' if source else ""
            row_lines = "\n".join(" | ".join(r) for r in val)
            emitted.append(("tag", f'[TABEL judul="{safe_title}"{src_attr}]\n{row_lines}\n[/TABEL]'))
            continue

        emitted.append(("p", str(val)))

    # 3. Pisahkan Cover Title, Kata Pengantar, Isi BAB, dan Daftar Pustaka
    first_bab_idx = next((idx for idx, (k, v) in enumerate(emitted) if k == "p" and BAB_RX.match(v)), -1)
    bib_idx = next(
        (idx for idx, (k, v) in enumerate(emitted) if k == "p" and BIB_RX.match(v) and idx > max(0, first_bab_idx)),
        -1,
    )

    suggested_title = ""
    abstract_body = ""
    abstract_keywords = ""
    preface_body = ""
    bibliography = ""

    content_end_idx = len(emitted)
    if bib_idx != -1:
        content_end_idx = bib_idx
        bib_entries = [v for k, v in emitted[bib_idx + 1 :] if k == "p" and v]
        bibliography = "\n".join(bib_entries)

    body_start_idx = 0
    if first_bab_idx > 0:
        mode = "cover"
        abstract_paras: List[str] = []
        preface_paras: List[str] = []
        for k, v in emitted[:first_bab_idx]:
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
            if mode == "cover" and not suggested_title and not re.match(r"^MAKALAH$", v, re.I) and 10 <= len(v) <= 200:
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
        if not BAB_RX.match(first_line) and not PREFACE_RX.match(first_line) and 10 <= len(first_line) <= 180:
            suggested_title = first_line.upper()

    if not suggested_title:
        base_name = re.sub(r"\.[^.]+$", "", file_name or "MAKALAH AKADEMIK")
        suggested_title = re.sub(r"[_-]+", " ", base_name).strip().upper()

    list_item_rx = re.compile(r"^(?:[-•*–—]|\d+[\.\)]|[a-z][\.\)])\s+")

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

    body_blocks = emitted[body_start_idx:content_end_idx]
    body_text = _join_blocks(body_blocks)
    raw_preview_text = _join_blocks(emitted)
    final_body = body_text or raw_preview_text

    full_words_text = " ".join(x for x in [preface_body, final_body, bibliography] if x)
    word_count = len([w for w in re.split(r"\s+", full_words_text) if w])
    bab_count = len(re.findall(r"^(?:#+\s*)?(?:\*\*|__)?\s*BAB\s+[IVXLCDM0-9]+", final_body, re.I | re.M))

    return {
        "engine": "python-docx",
        "fileName": file_name,
        "bodyText": final_body,
        "rawPreviewText": raw_preview_text,
        "suggestedTitle": suggested_title,
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

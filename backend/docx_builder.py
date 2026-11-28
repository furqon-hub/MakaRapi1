"""
MakaRapi — Builder Dokumen Word (.docx) Asli Berbasis Python (python-docx + lxml)
Menghasilkan file OOXML .docx standar Microsoft Word dengan:
- Print Layout permanen saat dibuka maupun Ctrl+S (<w:view w:val="print"/>)
- Bahasa dokumen Bahasa Indonesia (id-ID)
- Style Heading 1, Heading 2, Caption, TOC 1, TOC 2, Table of Figures, Hyperlink (hitam)
- Field TOC otomatis (Daftar Isi, Daftar Tabel, Daftar Gambar) berbasis tab-stop dot leader
- Caption SEQ Tabel & SEQ Gambar yang dapat di-Update Field langsung di Word
- Section break per BAB dengan penomoran halaman Romawi & Arab + Different First Page
"""

from __future__ import annotations

import base64
import html as html_lib
import io
import re
from typing import Any, Dict, List, Optional, Tuple

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor


def _cm_to_twips(cm: float) -> int:
    return int(round(float(cm or 0) * 566.929133858))


def _pt_to_half_pt(pt: float) -> int:
    return int(round(float(pt or 12) * 2))


def _set_run_font(run, font_name: str, size_pt: Optional[float] = None, bold: Optional[bool] = None, italic: Optional[bool] = None, color_hex: str = "000000"):
    run.font.name = font_name
    rPr = run._r.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), font_name)
    rFonts.set(qn("w:hAnsi"), font_name)
    rFonts.set(qn("w:cs"), font_name)
    rFonts.set(qn("w:eastAsia"), font_name)
    if size_pt is not None:
        run.font.size = Pt(size_pt)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color_hex:
        run.font.color.rgb = RGBColor.from_string(color_hex)


def _add_field(paragraph, instr: str, display_text: str, font_name: str, size_pt: float, bold: bool = False, italic: bool = False, color_hex: str = "000000"):
    def _mk_run():
        r = paragraph.add_run()
        _set_run_font(r, font_name, size_pt=size_pt, bold=bold, italic=italic, color_hex=color_hex)
        return r

    r_begin = _mk_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    r_begin._r.append(fld_begin)

    r_instr = _mk_run()
    instr_el = OxmlElement("w:instrText")
    instr_el.set(qn("xml:space"), "preserve")
    instr_el.text = f" {instr} "
    r_instr._r.append(instr_el)

    r_sep = _mk_run()
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    r_sep._r.append(fld_sep)

    r_val = _mk_run()
    r_val.text = display_text

    r_end = _mk_run()
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    r_end._r.append(fld_end)


def _add_inline_html_runs(paragraph, html_str: str, font_name: str, size_pt: float, base_bold: bool = False, base_italic: bool = False):
    """Konversi markup inline ringan (<i>, <em>, <b>, <strong>, <br/>) menjadi run python-docx."""
    tokens = re.split(r"(<\/?(?:i|em|b|strong|br\s*\/?)>)", str(html_str or ""), flags=re.I)
    bold = base_bold
    italic = base_italic
    for tok in tokens:
        if not tok:
            continue
        low = tok.lower()
        if low in ("<i>", "<em>"):
            italic = True
            continue
        if low in ("</i>", "</em>"):
            italic = base_italic
            continue
        if low in ("<b>", "<strong>"):
            bold = True
            continue
        if low in ("</b>", "</strong>"):
            bold = base_bold
            continue
        if re.match(r"^<br\s*/?>$", low):
            paragraph.add_run().add_break()
            continue
        plain = html_lib.unescape(re.sub(r"<[^>]+>", "", tok))
        if not plain:
            continue
        r = paragraph.add_run(plain)
        _set_run_font(r, font_name, size_pt=size_pt, bold=bold, italic=italic)


def _decode_data_url(data_url: str) -> Optional[Tuple[bytes, str]]:
    m = re.match(r"^data:image/(png|jpeg|jpg|gif|webp);base64,(.+)$", str(data_url or ""), flags=re.I | re.S)
    if not m:
        return None
    ext = m.group(1).lower()
    if ext == "jpg":
        ext = "jpeg"
    try:
        raw = base64.b64decode(re.sub(r"\s+", "", m.group(2)))
        return (raw, ext) if raw else None
    except Exception:
        return None


def _read_image_dims(raw: bytes, ext: str) -> Optional[Tuple[int, int]]:
    if len(raw) < 24:
        return None
    if ext == "png" and raw[:2] == b"\x89P":
        w = int.from_bytes(raw[16:20], "big")
        h = int.from_bytes(raw[20:24], "big")
        return (w, h) if w > 0 and h > 0 else None
    if ext == "jpeg" and raw[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(raw):
            if raw[i] != 0xFF:
                i += 1
                continue
            marker = raw[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h = (raw[i + 5] << 8) | raw[i + 6]
                w = (raw[i + 7] << 8) | raw[i + 8]
                return (w, h) if w > 0 and h > 0 else None
            seg_len = (raw[i + 2] << 8) | raw[i + 3]
            if seg_len < 2:
                break
            i += 2 + seg_len
    return None


def _configure_section_layout(section, paper_w_cm: float, paper_h_cm: float, margins: Dict[str, float], num_mode: str, num_fmt: Optional[str], num_start: Optional[int], font_name: str, page_num_pt: float):
    section.page_width = Cm(paper_w_cm)
    section.page_height = Cm(paper_h_cm)
    section.top_margin = Cm(margins["top"])
    section.right_margin = Cm(margins["right"])
    section.bottom_margin = Cm(margins["bottom"])
    section.left_margin = Cm(margins["left"])
    section.header_distance = Cm(1.5)
    section.footer_distance = Cm(1.5)

    # Putuskan tautan ke section sebelumnya agar aturan nomor halaman independen
    section.header.is_linked_to_previous = False
    section.footer.is_linked_to_previous = False
    section.first_page_header.is_linked_to_previous = False
    section.first_page_footer.is_linked_to_previous = False

    def _clear(hf):
        for p in hf.paragraphs:
            p.text = ""

    def _put_page_num(hf, align):
        p = hf.paragraphs[0] if hf.paragraphs else hf.add_paragraph()
        p.text = ""
        p.alignment = align
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        _add_field(p, "PAGE", "1", font_name, page_num_pt)

    _clear(section.header)
    _clear(section.footer)
    _clear(section.first_page_header)
    _clear(section.first_page_footer)

    if num_mode == "none":
        section.different_first_page_header_footer = False
    elif num_mode == "bottom-center":
        section.different_first_page_header_footer = False
        _put_page_num(section.footer, WD_ALIGN_PARAGRAPH.CENTER)
    elif num_mode == "top-right":
        section.different_first_page_header_footer = False
        _put_page_num(section.header, WD_ALIGN_PARAGRAPH.RIGHT)
    else:
        # Mode standar skripsi: awal BAB di tengah bawah, lanjutan di pojok kanan atas
        section.different_first_page_header_footer = True
        _put_page_num(section.first_page_footer, WD_ALIGN_PARAGRAPH.CENTER)
        _put_page_num(section.header, WD_ALIGN_PARAGRAPH.RIGHT)

    # Atur format & angka mulai nomor halaman (lowerRoman / decimal)
    sectPr = section._sectPr
    old_pgnum = sectPr.find(qn("w:pgNumType"))
    if old_pgnum is not None:
        sectPr.remove(old_pgnum)
    if num_fmt or num_start is not None:
        pgnum = OxmlElement("w:pgNumType")
        if num_fmt:
            pgnum.set(qn("w:fmt"), num_fmt)
        if num_start is not None:
            pgnum.set(qn("w:start"), str(num_start))
        sectPr.append(pgnum)


def _configure_styles_and_settings(
    doc: Document,
    font_name: str,
    font_size_pt: float,
    heading_size_pt: float,
    line_spacing: float,
    content_width_cm: float,
    space_before_pt: float = 0.0,
    space_after_pt: float = 0.0,
    apply_spacing_to_headings: bool = False,
):
    # 1. Settings: Print Layout permanen & mode Word modern (tanpa Compatibility Mode)
    settings_el = doc.settings.element
    if settings_el.find(qn("w:view")) is None:
        view_el = OxmlElement("w:view")
        view_el.set(qn("w:val"), "print")
        settings_el.insert(0, view_el)
    else:
        settings_el.find(qn("w:view")).set(qn("w:val"), "print")

    compat_el = settings_el.find(qn("w:compat"))
    if compat_el is None:
        compat_el = OxmlElement("w:compat")
        settings_el.append(compat_el)
    compat_mode_set = False
    for cs in compat_el.findall(qn("w:compatSetting")):
        if cs.get(qn("w:name")) == "compatibilityMode":
            cs.set(qn("w:val"), "15")
            compat_mode_set = True
    if not compat_mode_set:
        cs = OxmlElement("w:compatSetting")
        cs.set(qn("w:name"), "compatibilityMode")
        cs.set(qn("w:uri"), "http://schemas.microsoft.com/office/word")
        cs.set(qn("w:val"), "15")
        compat_el.append(cs)

    # 2. DocDefaults bahasa id-ID & font dasar
    styles_el = doc.styles.element
    doc_defaults = styles_el.find(qn("w:docDefaults"))
    if doc_defaults is not None:
        rPrDef = doc_defaults.find(qn("w:rPrDefault"))
        if rPrDef is not None:
            rPr = rPrDef.find(qn("w:rPr"))
            if rPr is None:
                rPr = OxmlElement("w:rPr")
                rPrDef.append(rPr)
            lang = rPr.find(qn("w:lang"))
            if lang is None:
                lang = OxmlElement("w:lang")
                rPr.append(lang)
            lang.set(qn("w:val"), "id-ID")
            lang.set(qn("w:eastAsia"), "en-US")
            lang.set(qn("w:bidi"), "ar-SA")

    # 3. Normal
    normal = doc.styles["Normal"]
    normal.font.name = font_name
    normal.font.size = Pt(font_size_pt)
    normal.font.color.rgb = RGBColor(0, 0, 0)
    normal.paragraph_format.line_spacing = line_spacing
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    n_rPr = normal.element.get_or_add_rPr()
    n_fonts = n_rPr.find(qn("w:rFonts"))
    if n_fonts is None:
        n_fonts = OxmlElement("w:rFonts")
        n_rPr.insert(0, n_fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        n_fonts.set(qn(attr), font_name)

    # 4. Heading 1 (BAB, Kata Pengantar, Daftar Isi, Daftar Tabel, Daftar Gambar, Daftar Pustaka)
    h1 = doc.styles["Heading 1"]
    h1.font.name = font_name
    h1.font.size = Pt(heading_size_pt)
    h1.font.bold = True
    h1.font.all_caps = True
    h1.font.color.rgb = RGBColor(0, 0, 0)
    h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h1.paragraph_format.line_spacing = 1.35
    h1.paragraph_format.space_before = Pt(space_before_pt if apply_spacing_to_headings else 0)
    h1.paragraph_format.space_after = Pt(space_after_pt if apply_spacing_to_headings else 14)
    h1.paragraph_format.first_line_indent = Cm(0)
    h1.paragraph_format.keep_with_next = True
    h1_rPr = h1.element.get_or_add_rPr()
    h1_fonts = h1_rPr.find(qn("w:rFonts"))
    if h1_fonts is None:
        h1_fonts = OxmlElement("w:rFonts")
        h1_rPr.insert(0, h1_fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        h1_fonts.set(qn(attr), font_name)

    # 5. Heading 2 (Sub-bab)
    h2 = doc.styles["Heading 2"]
    h2.font.name = font_name
    h2.font.size = Pt(font_size_pt)
    h2.font.bold = True
    h2.font.color.rgb = RGBColor(0, 0, 0)
    h2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h2.paragraph_format.line_spacing = line_spacing
    h2.paragraph_format.space_before = Pt(space_before_pt if apply_spacing_to_headings else 10)
    h2.paragraph_format.space_after = Pt(space_after_pt if apply_spacing_to_headings else 4)
    h2.paragraph_format.first_line_indent = Cm(0)
    h2.paragraph_format.keep_with_next = True
    h2_rPr = h2.element.get_or_add_rPr()
    h2_fonts = h2_rPr.find(qn("w:rFonts"))
    if h2_fonts is None:
        h2_fonts = OxmlElement("w:rFonts")
        h2_rPr.insert(0, h2_fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        h2_fonts.set(qn(attr), font_name)

    # 5b. Heading 3 (Sub-sub-bab, mis. 1.1.1 / 2.1.1)
    h3 = doc.styles["Heading 3"]
    h3.font.name = font_name
    h3.font.size = Pt(font_size_pt)
    h3.font.bold = True
    h3.font.color.rgb = RGBColor(0, 0, 0)
    h3.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h3.paragraph_format.line_spacing = line_spacing
    h3.paragraph_format.space_before = Pt(space_before_pt if apply_spacing_to_headings else 6)
    h3.paragraph_format.space_after = Pt(space_after_pt if apply_spacing_to_headings else 3)
    h3.paragraph_format.first_line_indent = Cm(0)
    h3.paragraph_format.keep_with_next = True
    h3_rPr = h3.element.get_or_add_rPr()
    h3_fonts = h3_rPr.find(qn("w:rFonts"))
    if h3_fonts is None:
        h3_fonts = OxmlElement("w:rFonts")
        h3_rPr.insert(0, h3_fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        h3_fonts.set(qn(attr), font_name)

    # 6. Helper tambah style OOXML custom (Caption, TOC1, TOC2, TableofFigures, Hyperlink) bila belum ada
    existing_ids = {s.style_id for s in doc.styles}
    tab_pos = _cm_to_twips(content_width_cm)
    font_half_pt = _pt_to_half_pt(font_size_pt)
    line_val = int(round(line_spacing * 240))

    if "Caption" not in existing_ids:
        styles_el.append(
            parse_xml(
                f'<w:style {nsdecls("w")} w:type="paragraph" w:styleId="Caption">'
                f'<w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
                f'<w:pPr><w:spacing w:before="120" w:after="80" w:line="288" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr>'
                f'<w:rPr><w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>'
                f'<w:color w:val="000000"/><w:sz w:val="{font_half_pt}"/><w:szCs w:val="{font_half_pt}"/></w:rPr>'
                f"</w:style>"
            )
        )

    if "TOC1" not in existing_ids:
        styles_el.append(
            parse_xml(
                f'<w:style {nsdecls("w")} w:type="paragraph" w:styleId="TOC1">'
                f'<w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>'
                f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{tab_pos}"/></w:tabs>'
                f'<w:spacing w:before="80" w:after="40" w:line="{line_val}" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/></w:pPr>'
                f'<w:rPr><w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>'
                f'<w:b/><w:bCs/><w:color w:val="000000"/><w:sz w:val="{font_half_pt}"/><w:szCs w:val="{font_half_pt}"/></w:rPr>'
                f"</w:style>"
            )
        )

    if "TOC2" not in existing_ids:
        indent_l = _cm_to_twips(0.85)
        styles_el.append(
            parse_xml(
                f'<w:style {nsdecls("w")} w:type="paragraph" w:styleId="TOC2">'
                f'<w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>'
                f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{tab_pos}"/></w:tabs>'
                f'<w:spacing w:before="0" w:after="40" w:line="{line_val}" w:lineRule="auto"/><w:ind w:left="{indent_l}" w:firstLine="0"/></w:pPr>'
                f'<w:rPr><w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>'
                f'<w:color w:val="000000"/><w:sz w:val="{font_half_pt}"/><w:szCs w:val="{font_half_pt}"/></w:rPr>'
                f"</w:style>"
            )
        )

    if "TOC3" not in existing_ids:
        indent_l3 = _cm_to_twips(1.5)
        styles_el.append(
            parse_xml(
                f'<w:style {nsdecls("w")} w:type="paragraph" w:styleId="TOC3">'
                f'<w:name w:val="toc 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>'
                f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{tab_pos}"/></w:tabs>'
                f'<w:spacing w:before="0" w:after="30" w:line="{line_val}" w:lineRule="auto"/><w:ind w:left="{indent_l3}" w:firstLine="0"/></w:pPr>'
                f'<w:rPr><w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>'
                f'<w:color w:val="000000"/><w:sz w:val="{font_half_pt}"/><w:szCs w:val="{font_half_pt}"/></w:rPr>'
                f"</w:style>"
            )
        )

    if "TableofFigures" not in existing_ids:
        styles_el.append(
            parse_xml(
                f'<w:style {nsdecls("w")} w:type="paragraph" w:styleId="TableofFigures">'
                f'<w:name w:val="table of figures"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>'
                f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{tab_pos}"/></w:tabs>'
                f'<w:spacing w:before="0" w:after="60" w:line="{line_val}" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/></w:pPr>'
                f'<w:rPr><w:rFonts w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>'
                f'<w:color w:val="000000"/><w:sz w:val="{font_half_pt}"/><w:szCs w:val="{font_half_pt}"/></w:rPr>'
                f"</w:style>"
            )
        )

    if "Hyperlink" not in existing_ids:
        styles_el.append(
            parse_xml(
                f'<w:style {nsdecls("w")} w:type="character" w:styleId="Hyperlink">'
                f'<w:name w:val="Hyperlink"/>'
                f'<w:rPr><w:color w:val="000000"/><w:u w:val="none"/></w:rPr>'
                f"</w:style>"
            )
        )


def _add_toc_block(doc: Document, title: str, entries: List[Dict[str, Any]], field_instr: str, is_tof: bool, page_break_before: bool, font_name: str, font_size_pt: float, content_width_cm: float):
    h = doc.add_paragraph(style="Heading 1")
    h.paragraph_format.page_break_before = page_break_before
    r = h.add_run(title.upper())
    _set_run_font(r, font_name)

    if not entries:
        p = doc.add_paragraph(style="table of figures" if is_tof else "toc 1")
        p.paragraph_format.tab_stops.add_tab_stop(Cm(content_width_cm), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        _add_field(p, field_instr, "(Belum ada entri — klik kanan lalu pilih Update Field)", font_name, font_size_pt, italic=True, color_hex="555555")
        return

    for idx, entry in enumerate(entries):
        is_first = idx == 0
        is_last = idx == len(entries) - 1
        lvl = int(entry.get("level") or 1)
        is_bold = bool(entry.get("bold")) and not is_tof
        style_name = "table of figures" if is_tof else ("toc 3" if lvl >= 3 else ("toc 2" if lvl == 2 else "toc 1"))

        p = doc.add_paragraph(style=style_name)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(content_width_cm), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        if not is_tof and lvl >= 3:
            p.paragraph_format.left_indent = Cm(1.5)
        elif not is_tof and lvl == 2:
            p.paragraph_format.left_indent = Cm(0.85)
        else:
            p.paragraph_format.left_indent = Cm(0)

        def _mk():
            run = p.add_run()
            _set_run_font(run, font_name, size_pt=font_size_pt, bold=is_bold)
            return run

        if is_first:
            rb = _mk()
            fb = OxmlElement("w:fldChar")
            fb.set(qn("w:fldCharType"), "begin")
            rb._r.append(fb)

            ri = _mk()
            ie = OxmlElement("w:instrText")
            ie.set(qn("xml:space"), "preserve")
            ie.text = f" {field_instr} "
            ri._r.append(ie)

            rs = _mk()
            fs = OxmlElement("w:fldChar")
            fs.set(qn("w:fldCharType"), "separate")
            rs._r.append(fs)

        rt = _mk()
        rt.text = str(entry.get("title") or "")

        rtab = _mk()
        rtab.add_tab()

        rp = _mk()
        rp.text = str(entry.get("page") or "")

        if is_last:
            re_run = _mk()
            fe = OxmlElement("w:fldChar")
            fe.set(qn("w:fldCharType"), "end")
            re_run._r.append(fe)


def _add_caption_paragraph(doc: Document, number_label: str, title: str, default_kind: str, centered: bool, font_name: str, font_size_pt: float):
    p = doc.add_paragraph(style="caption")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if centered else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(4 if centered else 10)
    p.paragraph_format.space_after = Pt(3 if centered else 4)
    p.paragraph_format.keep_with_next = not centered

    m = re.match(r"^(Tabel|Gambar)\s+(?:(\d+)\.)?(\d+)$", str(number_label or "").strip(), flags=re.I)
    if m:
        kind = m.group(1).capitalize() or default_kind
        bab_prefix = f"{m.group(2)}." if m.group(2) else ""
        seq_num = m.group(3)
        instr = f"SEQ {kind} \\* ARABIC" + (" \\s 1" if bab_prefix else "")

        r1 = p.add_run(f"{kind} {bab_prefix}")
        _set_run_font(r1, font_name, size_pt=font_size_pt, bold=True)
        _add_field(p, instr, seq_num, font_name, font_size_pt, bold=True)
        r2 = p.add_run(". ")
        _set_run_font(r2, font_name, size_pt=font_size_pt, bold=True)
    else:
        r1 = p.add_run(f"{number_label}. ")
        _set_run_font(r1, font_name, size_pt=font_size_pt, bold=True)

    rt = p.add_run(str(title or ""))
    _set_run_font(rt, font_name, size_pt=font_size_pt, bold=False)
    return p


def _add_academic_table(doc: Document, block: Dict[str, Any], font_name: str, font_size_pt: float, content_width_cm: float):
    rows = block.get("rows") or []
    if not rows:
        return
    col_count = max(1, max(len(r) for r in rows))
    col_w_twips = _cm_to_twips(content_width_cm) // col_count
    tbl_font_pt = max(font_size_pt - 1, 10)

    tbl = doc.add_table(rows=len(rows), cols=col_count)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False

    tblPr = tbl._tbl.tblPr
    tblW = OxmlElement("w:tblW")
    tblW.set(qn("w:w"), str(_cm_to_twips(content_width_cm)))
    tblW.set(qn("w:type"), "dxa")
    tblPr.append(tblW)

    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        '<w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        '<w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        '<w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        '<w:insideH w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        '<w:insideV w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
        "</w:tblBorders>"
    )
    tblPr.append(borders)

    cell_mar = parse_xml(
        f'<w:tblCellMar {nsdecls("w")}>'
        '<w:top w:w="80" w:type="dxa"/><w:left w:w="110" w:type="dxa"/>'
        '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="110" w:type="dxa"/>'
        "</w:tblCellMar>"
    )
    tblPr.append(cell_mar)

    for r_idx, row_data in enumerate(rows):
        is_hdr = r_idx == 0
        tr = tbl.rows[r_idx]
        trPr = tr._tr.get_or_add_trPr()
        trPr.append(OxmlElement("w:cantSplit"))
        if is_hdr:
            trPr.append(OxmlElement("w:tblHeader"))

        for c_idx in range(col_count):
            cell = tr.cells[c_idx]
            tcPr = cell._tc.get_or_add_tcPr()
            tcW = OxmlElement("w:tcW")
            tcW.set(qn("w:w"), str(col_w_twips))
            tcW.set(qn("w:type"), "dxa")
            tcPr.append(tcW)
            if is_hdr:
                tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="F4F3EF"/>'))

            p = cell.paragraphs[0]
            p.text = ""
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.25
            p.paragraph_format.first_line_indent = Cm(0)

            cell_html = row_data[c_idx] if c_idx < len(row_data) else ""
            _add_inline_html_runs(p, cell_html, font_name, tbl_font_pt, base_bold=is_hdr)


class _WordListNumberingManager:
    """Mengelola penomoran & bullet otomatis asli Word (word/numbering.xml) per blok daftar."""

    def __init__(self, doc: Document, font_name: str, font_size_pt: float):
        self.numbering_el = doc.part.numbering_part._element
        existing_abs = [int(x.get(qn("w:abstractNumId"))) for x in self.numbering_el.findall(qn("w:abstractNum"))]
        existing_nums = [int(x.get(qn("w:numId"))) for x in self.numbering_el.findall(qn("w:num"))]
        base_abs = max(existing_abs, default=0) + 10
        self.next_num_id = max(existing_nums, default=0) + 10

        half_pt = _pt_to_half_pt(font_size_pt)
        safe_font = html_lib.escape(font_name, quote=True)

        # 5 definisi abstractNum standar Word untuk daftar isi teks (left=720 / 1.27cm, hanging=360 / 0.635cm)
        # + 1 definisi khusus Sub-bab huruf besar tebal (A., B., C. — flush left 0cm, hanging=360 / 0.635cm)
        specs = [
            ("decimal_dot", "decimal", "%1.", safe_font, 720, 360, False),
            ("decimal_paren", "decimal", "%1)", safe_font, 720, 360, False),
            ("alpha_dot", "lowerLetter", "%1.", safe_font, 720, 360, False),
            ("alpha_paren", "lowerLetter", "%1)", safe_font, 720, 360, False),
            ("bullet", "bullet", "&#x2022;", "Symbol", 720, 360, False),
            ("subbab_alpha", "upperLetter", "%1.", safe_font, 360, 360, True),
        ]

        self.abs_id_by_kind: Dict[str, int] = {}
        self.next_abs_id = base_abs + len(specs)
        self.safe_font = safe_font
        self.half_pt = half_pt
        first_num_el = self.numbering_el.find(qn("w:num"))

        for offset, (kind, num_fmt, lvl_text, r_font, left_tw, hang_tw, is_bold) in enumerate(specs):
            abs_id = base_abs + offset
            self.abs_id_by_kind[kind] = abs_id
            bold_xml = "<w:b/><w:bCs/>" if is_bold else ""
            abs_xml = parse_xml(
                f'<w:abstractNum {nsdecls("w")} w:abstractNumId="{abs_id}">'
                f'<w:multiLevelType w:val="singleLevel"/>'
                f'<w:lvl w:ilvl="0">'
                f'<w:start w:val="1"/>'
                f'<w:numFmt w:val="{num_fmt}"/>'
                f'<w:lvlText w:val="{lvl_text}"/>'
                f'<w:lvlJc w:val="left"/>'
                f'<w:pPr><w:ind w:left="{left_tw}" w:hanging="{hang_tw}"/></w:pPr>'
                f'<w:rPr><w:rFonts w:ascii="{r_font}" w:hAnsi="{r_font}" w:cs="{safe_font}"/>'
                f'{bold_xml}<w:color w:val="000000"/><w:sz w:val="{half_pt}"/><w:szCs w:val="{half_pt}"/></w:rPr>'
                f"</w:lvl>"
                f"</w:abstractNum>"
            )
            if first_num_el is not None:
                first_num_el.addprevious(abs_xml)
            else:
                self.numbering_el.append(abs_xml)

    def _register_custom_subbab_decimal(self, prefix_str: str, trailing_dot: str) -> int:
        """Buat abstractNum khusus untuk sub-bab numerik bertingkat (mis. 1.1, 2.1, 2.1.)."""
        cache_key = f"subbab_dec_{prefix_str}_{trailing_dot}"
        if cache_key in self.abs_id_by_kind:
            return self.abs_id_by_kind[cache_key]
        abs_id = self.next_abs_id
        self.next_abs_id += 1
        self.abs_id_by_kind[cache_key] = abs_id
        lvl_text = html_lib.escape(f"{prefix_str}.%1{trailing_dot}", quote=True)
        abs_xml = parse_xml(
            f'<w:abstractNum {nsdecls("w")} w:abstractNumId="{abs_id}">'
            f'<w:multiLevelType w:val="singleLevel"/>'
            f'<w:lvl w:ilvl="0">'
            f'<w:start w:val="1"/>'
            f'<w:numFmt w:val="decimal"/>'
            f'<w:lvlText w:val="{lvl_text}"/>'
            f'<w:lvlJc w:val="left"/>'
            f'<w:pPr><w:ind w:left="480" w:hanging="480"/></w:pPr>'
            f'<w:rPr><w:rFonts w:ascii="{self.safe_font}" w:hAnsi="{self.safe_font}" w:cs="{self.safe_font}"/>'
            f'<w:b/><w:bCs/><w:color w:val="000000"/><w:sz w:val="{self.half_pt}"/><w:szCs w:val="{self.half_pt}"/></w:rPr>'
            f"</w:lvl>"
            f"</w:abstractNum>"
        )
        first_num_el = self.numbering_el.find(qn("w:num"))
        if first_num_el is not None:
            first_num_el.addprevious(abs_xml)
        else:
            self.numbering_el.append(abs_xml)
        return abs_id

    def allocate_subbab_num_id(self, kind: str, prefix_str: str = "", trailing_dot: str = "") -> int:
        if kind == "subbab_alpha":
            abs_id = self.abs_id_by_kind["subbab_alpha"]
        else:
            abs_id = self._register_custom_subbab_decimal(prefix_str, trailing_dot)
        num_id = self.next_num_id
        self.next_num_id += 1
        num_xml = parse_xml(
            f'<w:num {nsdecls("w")} w:numId="{num_id}">'
            f'<w:abstractNumId w:val="{abs_id}"/>'
            f'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'
            f"</w:num>"
        )
        self.numbering_el.append(num_xml)
        return num_id

    @staticmethod
    def parse_subbab_prefix(raw_html: str) -> Tuple[Optional[str], str, str, str]:
        """Deteksi awalan manual sub-bab ('A. Judul' atau '1.1 Judul') agar diubah ke penomoran otomatis Word."""
        s = str(raw_html or "").strip()
        m_alpha = re.match(r"^([A-Z])\.\s+(.+)$", s)
        if m_alpha:
            return ("subbab_alpha", "", "", m_alpha.group(2).strip())
        m_dec = re.match(r"^(\d+(?:\.\d+)*)\.(\d+)(\.?)\s+(.+)$", s)
        if m_dec:
            return ("subbab_dec", m_dec.group(1), m_dec.group(3), m_dec.group(4).strip())
        return (None, "", "", s)

    def detect_kind(self, marker: str) -> str:
        m = str(marker or "").strip()
        if re.match(r"^\d+\.$", m):
            return "decimal_dot"
        if re.match(r"^\d+\)$", m):
            return "decimal_paren"
        if re.match(r"^[a-z]\.$", m):
            return "alpha_dot"
        if re.match(r"^[a-z]\)$", m):
            return "alpha_paren"
        return "bullet"

    def allocate_num_id(self, first_marker: str) -> int:
        kind = self.detect_kind(first_marker)
        abs_id = self.abs_id_by_kind[kind]
        num_id = self.next_num_id
        self.next_num_id += 1
        num_xml = parse_xml(
            f'<w:num {nsdecls("w")} w:numId="{num_id}">'
            f'<w:abstractNumId w:val="{abs_id}"/>'
            f'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'
            f"</w:num>"
        )
        self.numbering_el.append(num_xml)
        return num_id

    @staticmethod
    def attach_to_paragraph(paragraph, num_id: int, ilvl: int = 0):
        pPr = paragraph._p.get_or_add_pPr()
        old = pPr.find(qn("w:numPr"))
        if old is not None:
            pPr.remove(old)
        num_pr = parse_xml(
            f'<w:numPr {nsdecls("w")}>'
            f'<w:ilvl w:val="{ilvl}"/>'
            f'<w:numId w:val="{num_id}"/>'
            f"</w:numPr>"
        )
        # Urutan OOXML <w:pPr>: letakkan <w:numPr> sebelum <w:spacing>/<w:ind>/<w:jc>
        insert_before = None
        for tag in ("w:pBdr", "w:shd", "w:tabs", "w:spacing", "w:ind", "w:jc"):
            el = pPr.find(qn(tag))
            if el is not None:
                insert_before = el
                break
        if insert_before is not None:
            insert_before.addprevious(num_pr)
        else:
            pPr.append(num_pr)


def build_docx_from_payload(payload: Dict[str, Any]) -> bytes:
    """Bangun file .docx OOXML penuh dari JSON payload Workbench MakaRapi."""
    f = payload.get("format") or {}
    paper = payload.get("paper") or {"widthCm": 21.0, "heightCm": 29.7}
    typo = payload.get("typo") or {}
    cover = payload.get("cover") or {}
    preface = payload.get("preface") or {}

    font_name = str(f.get("fontFamily") or "Times New Roman").replace('"', "").replace("'", "").strip() or "Times New Roman"
    font_size_pt = float(typo.get("fontSizePt") or f.get("fontSize") or 12)
    heading_size_pt = float(typo.get("headingFontSizePt") or f.get("headingFontSize") or 14)
    line_spacing = float(typo.get("lineHeight") or f.get("lineSpacing") or 1.5)
    first_indent_cm = float(typo.get("firstIndentCm") if typo.get("firstIndentCm") is not None else f.get("firstIndent", 1.25))
    raw_sb = typo.get("spaceBeforePt") if typo.get("spaceBeforePt") is not None else f.get("spaceBefore", 0)
    raw_sa = typo.get("spaceAfterPt") if typo.get("spaceAfterPt") is not None else f.get("spaceAfter", 0)
    space_before_pt = max(0.0, min(36.0, float(raw_sb if raw_sb is not None else 0)))
    space_after_pt = max(0.0, min(36.0, float(raw_sa if raw_sa is not None else 0)))
    apply_spacing_to_headings = bool(
        typo.get("applySpacingToHeadings")
        if typo.get("applySpacingToHeadings") is not None
        else f.get("applySpacingToHeadings", False)
    )
    body_align = WD_ALIGN_PARAGRAPH.LEFT if (typo.get("textAlign") or f.get("textAlign")) == "left" else WD_ALIGN_PARAGRAPH.JUSTIFY
    num_mode = str(f.get("pageNumberMode") or "skripsi")

    paper_w_cm = float(paper.get("widthCm") or 21.0)
    paper_h_cm = float(paper.get("heightCm") or 29.7)
    margins = {
        "top": float(f.get("marginTop") or 4.0),
        "right": float(f.get("marginRight") or 3.0),
        "bottom": float(f.get("marginBottom") or 3.0),
        "left": float(f.get("marginLeft") or 4.0),
    }
    content_width_cm = max(8.0, paper_w_cm - margins["left"] - margins["right"])
    max_img_h_cm = max(6.0, paper_h_cm - margins["top"] - margins["bottom"] - 3.5)
    page_num_pt = max(font_size_pt - 1, 10)
    src_font_pt = max(font_size_pt - 2, 9)

    doc = Document()
    _configure_styles_and_settings(
        doc,
        font_name,
        font_size_pt,
        heading_size_pt,
        line_spacing,
        content_width_cm,
        space_before_pt=space_before_pt,
        space_after_pt=space_after_pt,
        apply_spacing_to_headings=apply_spacing_to_headings,
    )
    list_num_mgr = _WordListNumberingManager(doc, font_name, font_size_pt)

    section_started = False

    def _get_or_add_section(s_mode: str, s_fmt: Optional[str] = None, s_start: Optional[int] = None):
        nonlocal section_started
        if not section_started:
            sec = doc.sections[0]
            section_started = True
        else:
            sec = doc.add_section(WD_SECTION_START.NEW_PAGE)
        _configure_section_layout(sec, paper_w_cm, paper_h_cm, margins, s_mode, s_fmt, s_start, font_name, page_num_pt)
        return sec

    # -----------------------------------------------------------------------
    # A. Section Cover
    # -----------------------------------------------------------------------
    if f.get("showCover"):
        _get_or_add_section("none")
        title_pt = max(heading_size_pt, font_size_pt + 2)
        sub_pt = max(font_size_pt - 1, 10)

        p_title = doc.add_paragraph()
        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_title.paragraph_format.space_before = Pt(12)
        p_title.paragraph_format.space_after = Pt(16)
        p_title.paragraph_format.line_spacing = 1.4
        r = p_title.add_run(str(cover.get("title") or "JUDUL MAKALAH").upper())
        _set_run_font(r, font_name, size_pt=title_pt, bold=True)

        p_kind = doc.add_paragraph()
        p_kind.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_kind.paragraph_format.space_after = Pt(10)
        _set_run_font(p_kind.add_run("MAKALAH"), font_name, size_pt=font_size_pt, bold=True)

        if cover.get("subtitle"):
            p_sub = doc.add_paragraph()
            p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_sub.paragraph_format.space_after = Pt(6)
            _set_run_font(p_sub.add_run(str(cover["subtitle"])), font_name, size_pt=sub_pt)

        if cover.get("lecturer"):
            p_lec = doc.add_paragraph()
            p_lec.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_lec.paragraph_format.space_after = Pt(16)
            _set_run_font(p_lec.add_run(f"Dosen Pengampu: {cover['lecturer']}"), font_name, size_pt=sub_pt)

        logo_decoded = _decode_data_url(payload.get("coverLogoDataUrl") or "")
        p_logo = doc.add_paragraph()
        p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if logo_decoded:
            p_logo.paragraph_format.space_before = Pt(32)
            p_logo.paragraph_format.space_after = Pt(32)
            p_logo.add_run().add_picture(io.BytesIO(logo_decoded[0]), width=Cm(3.4))
        else:
            p_logo.paragraph_format.space_before = Pt(64)
            p_logo.paragraph_format.space_after = Pt(48)

        author_lines = [l.strip() for l in str(cover.get("authors") or "").splitlines() if l.strip()]
        if author_lines:
            p_by = doc.add_paragraph()
            p_by.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_by.paragraph_format.space_before = Pt(14)
            p_by.paragraph_format.space_after = Pt(6)
            _set_run_font(p_by.add_run("Disusun Oleh:"), font_name, size_pt=font_size_pt, bold=True)
            for al in author_lines:
                pa = doc.add_paragraph()
                pa.alignment = WD_ALIGN_PARAGRAPH.CENTER
                pa.paragraph_format.space_after = Pt(3)
                _set_run_font(pa.add_run(al), font_name, size_pt=font_size_pt)

        inst_lines = [l.strip() for l in str(cover.get("prodi") or "").splitlines() if l.strip()]
        if cover.get("university"):
            inst_lines.append(str(cover["university"]).strip())
        if cover.get("year"):
            inst_lines.append(str(cover["year"]).strip())
        if inst_lines:
            p_inst = doc.add_paragraph()
            p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_inst.paragraph_format.space_before = Pt(52)
            p_inst.paragraph_format.line_spacing = 1.4
            for idx, il in enumerate(inst_lines):
                if idx > 0:
                    p_inst.add_run().add_break()
                _set_run_font(p_inst.add_run(il.upper()), font_name, size_pt=font_size_pt, bold=True)

    # -----------------------------------------------------------------------
    # B. Section Halaman Awal (Romawi kecil: Abstrak, Kata Pengantar, Daftar Isi/Tabel/Gambar)
    # -----------------------------------------------------------------------
    abstract = payload.get("abstract") or {}
    has_front = any([f.get("showAbstract"), f.get("showPreface"), f.get("showToc"), f.get("showLot"), f.get("showLof")])
    if has_front:
        front_mode = "none" if num_mode == "none" else ("top-right" if num_mode == "top-right" else "bottom-center")
        _get_or_add_section(front_mode, "lowerRoman", 1)
        need_break = False

        if f.get("showAbstract"):
            h = doc.add_paragraph(style="Heading 1")
            _set_run_font(h.add_run("ABSTRAK"), font_name)

            abs_paras = [s.strip() for s in re.split(r"\n+", str(abstract.get("body") or "")) if s.strip()]
            for para in abs_paras:
                p = doc.add_paragraph()
                p.alignment = body_align
                p.paragraph_format.first_line_indent = Cm(0)
                p.paragraph_format.line_spacing = 1.0
                p.paragraph_format.space_after = Pt(6)
                _add_inline_html_runs(p, para, font_name, font_size_pt)

            kw_text = str(abstract.get("keywords") or "").strip()
            if kw_text:
                p_kw = doc.add_paragraph()
                p_kw.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p_kw.paragraph_format.first_line_indent = Cm(0)
                p_kw.paragraph_format.line_spacing = 1.0
                p_kw.paragraph_format.space_before = Pt(6)
                _set_run_font(p_kw.add_run("Kata Kunci: "), font_name, size_pt=font_size_pt, bold=True)
                _set_run_font(p_kw.add_run(kw_text), font_name, size_pt=font_size_pt, italic=True)
            need_break = True

        if f.get("showPreface"):
            h = doc.add_paragraph(style="Heading 1")
            h.paragraph_format.page_break_before = need_break
            _set_run_font(h.add_run("KATA PENGANTAR"), font_name)

            pref_list_rx = re.compile(r"^([-•*–—]|\d+[\.\)]|[a-z][\.\)])\s+(.*)$")
            pref_lines = [s.strip() for s in re.split(r"\n+", str(preface.get("body") or "")) if s.strip()]
            pi = 0
            while pi < len(pref_lines):
                lm = pref_list_rx.match(pref_lines[pi])
                if lm:
                    first_mk = lm.group(1)
                    first_kind = list_num_mgr.detect_kind(first_mk)
                    num_id = list_num_mgr.allocate_num_id(first_mk)
                    while pi < len(pref_lines):
                        lm_cur = pref_list_rx.match(pref_lines[pi])
                        if not lm_cur or list_num_mgr.detect_kind(lm_cur.group(1)) != first_kind:
                            break
                        p = doc.add_paragraph()
                        p.alignment = body_align
                        p.paragraph_format.line_spacing = line_spacing
                        p.paragraph_format.space_before = Pt(0)
                        p.paragraph_format.space_after = Pt(3)
                        list_num_mgr.attach_to_paragraph(p, num_id, ilvl=0)
                        _add_inline_html_runs(p, lm_cur.group(2).strip(), font_name, font_size_pt)
                        pi += 1
                    continue

                p = doc.add_paragraph()
                p.alignment = body_align
                p.paragraph_format.first_line_indent = Cm(first_indent_cm)
                p.paragraph_format.line_spacing = line_spacing
                p.paragraph_format.space_before = Pt(space_before_pt)
                p.paragraph_format.space_after = Pt(space_after_pt)
                _add_inline_html_runs(p, pref_lines[pi], font_name, font_size_pt)
                pi += 1

            p_sig = doc.add_paragraph()
            p_sig.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p_sig.paragraph_format.left_indent = Cm(content_width_cm * 0.6)
            p_sig.paragraph_format.first_line_indent = Cm(0)
            p_sig.paragraph_format.space_before = Pt(24)
            p_sig.paragraph_format.line_spacing = 1.35
            if preface.get("cityDate"):
                _set_run_font(p_sig.add_run(str(preface["cityDate"])), font_name, size_pt=font_size_pt)
                p_sig.add_run().add_break()
            p_sig.add_run().add_break()
            p_sig.add_run().add_break()
            p_sig.add_run().add_break()
            _set_run_font(p_sig.add_run(str(preface.get("signature") or "Penyusun")), font_name, size_pt=font_size_pt, bold=True)
            need_break = True

        if f.get("showToc"):
            _add_toc_block(doc, "DAFTAR ISI", payload.get("tocEntries") or [], 'TOC \\o "1-3" \\h \\z \\u', False, need_break, font_name, font_size_pt, content_width_cm)
            need_break = True
        if f.get("showLot"):
            _add_toc_block(doc, "DAFTAR TABEL", payload.get("lotEntries") or [], 'TOC \\h \\z \\c "Tabel"', True, need_break, font_name, font_size_pt, content_width_cm)
            need_break = True
        if f.get("showLof"):
            _add_toc_block(doc, "DAFTAR GAMBAR", payload.get("lofEntries") or [], 'TOC \\h \\z \\c "Gambar"', True, need_break, font_name, font_size_pt, content_width_cm)

    # -----------------------------------------------------------------------
    # C. Section Setiap BAB (Angka Arab mulai 1)
    # -----------------------------------------------------------------------
    body_sec_count = 0
    for ch in payload.get("chapters") or []:
        blocks = ch.get("blocks") or []
        if not blocks:
            continue
        body_sec_count += 1
        _get_or_add_section(num_mode, "decimal" if body_sec_count == 1 else None, 1 if body_sec_count == 1 else None)
        chapter_subbab_num_ids: Dict[str, int] = {}

        for block in blocks:
            btype = block.get("type")
            if btype == "bab":
                h = doc.add_paragraph(style="Heading 1")
                _set_run_font(h.add_run(str(block.get("babLabel") or "")), font_name)
                if block.get("babSubtitle"):
                    h.add_run().add_break()
                    _set_run_font(h.add_run(str(block["babSubtitle"])), font_name)

            elif btype == "subbab":
                h2 = doc.add_paragraph(style="Heading 2")
                raw_sub = block.get("html") or block.get("text") or ""
                sb_kind, sb_prefix, sb_dot, sb_clean_html = list_num_mgr.parse_subbab_prefix(raw_sub)
                if sb_kind:
                    # Samakan cache_key tanpa sb_dot agar "1.1." lalu "1.2" tetap satu seri (1.1, 1.2, 1.3, 1.4) dan tidak reset ke 1.1
                    cache_key = f"{sb_kind}:{sb_prefix}"
                    if cache_key not in chapter_subbab_num_ids:
                        chapter_subbab_num_ids[cache_key] = list_num_mgr.allocate_subbab_num_id(sb_kind, sb_prefix, "")
                    list_num_mgr.attach_to_paragraph(h2, chapter_subbab_num_ids[cache_key], ilvl=0)
                    _add_inline_html_runs(h2, sb_clean_html, font_name, font_size_pt, base_bold=True)
                else:
                    _add_inline_html_runs(h2, raw_sub, font_name, font_size_pt, base_bold=True)

            elif btype == "subsubbab":
                h3 = doc.add_paragraph(style="Heading 3")
                raw_sub3 = block.get("html") or block.get("text") or ""
                sb_kind, sb_prefix, sb_dot, sb_clean_html = list_num_mgr.parse_subbab_prefix(raw_sub3)
                if sb_kind:
                    cache_key = f"h3:{sb_kind}:{sb_prefix}"
                    if cache_key not in chapter_subbab_num_ids:
                        chapter_subbab_num_ids[cache_key] = list_num_mgr.allocate_subbab_num_id(sb_kind, sb_prefix, "")
                    list_num_mgr.attach_to_paragraph(h3, chapter_subbab_num_ids[cache_key], ilvl=0)
                    _add_inline_html_runs(h3, sb_clean_html, font_name, font_size_pt, base_bold=True)
                else:
                    _add_inline_html_runs(h3, raw_sub3, font_name, font_size_pt, base_bold=True)

            elif btype == "list":
                items = block.get("items") or []
                if items:
                    num_id = list_num_mgr.allocate_num_id(items[0].get("marker", "1."))
                    for it in items:
                        p = doc.add_paragraph()
                        p.alignment = body_align
                        p.paragraph_format.line_spacing = line_spacing
                        p.paragraph_format.space_before = Pt(0)
                        p.paragraph_format.space_after = Pt(3)
                        list_num_mgr.attach_to_paragraph(p, num_id, ilvl=0)
                        _add_inline_html_runs(p, it.get("html") or it.get("text") or "", font_name, font_size_pt)

            elif btype == "table":
                _add_caption_paragraph(doc, block.get("numberLabel") or "Tabel", block.get("title") or "", "Tabel", False, font_name, font_size_pt)
                _add_academic_table(doc, block, font_name, font_size_pt, content_width_cm)
                if block.get("source"):
                    ps = doc.add_paragraph()
                    ps.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    ps.paragraph_format.space_before = Pt(4)
                    ps.paragraph_format.space_after = Pt(10)
                    ps.paragraph_format.line_spacing = 1.25
                    _set_run_font(ps.add_run(f"Sumber: {block['source']}"), font_name, size_pt=src_font_pt, italic=True)
                else:
                    pe = doc.add_paragraph()
                    pe.paragraph_format.space_after = Pt(8)

            elif btype == "figure":
                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(10)
                p_img.paragraph_format.space_after = Pt(4)
                p_img.paragraph_format.keep_with_next = True

                decoded = _decode_data_url(block.get("dataUrl") or "")
                if decoded:
                    raw_bytes, ext = decoded
                    width_pct = max(40, min(100, float(block.get("widthPct") or 85)))
                    target_w_cm = min(content_width_cm, content_width_cm * width_pct / 100.0)
                    dims = _read_image_dims(raw_bytes, ext)
                    if dims and dims[0] > 0 and dims[1] > 0:
                        aspect = dims[0] / dims[1]
                        target_h_cm = target_w_cm / aspect
                        if target_h_cm > max_img_h_cm:
                            target_w_cm = max_img_h_cm * aspect
                    p_img.add_run().add_picture(io.BytesIO(raw_bytes), width=Cm(target_w_cm))
                else:
                    _set_run_font(p_img.add_run(f"[Gambar: {block.get('title') or ''}]"), font_name, size_pt=font_size_pt, italic=True)

                _add_caption_paragraph(doc, block.get("numberLabel") or "Gambar", block.get("title") or "", "Gambar", True, font_name, font_size_pt)
                if block.get("source"):
                    ps = doc.add_paragraph()
                    ps.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    ps.paragraph_format.space_before = Pt(0)
                    ps.paragraph_format.space_after = Pt(10)
                    ps.paragraph_format.line_spacing = 1.25
                    _set_run_font(ps.add_run(f"Sumber: {block['source']}"), font_name, size_pt=src_font_pt, italic=True)

            else:
                p = doc.add_paragraph()
                p.alignment = body_align
                p.paragraph_format.first_line_indent = Cm(first_indent_cm)
                p.paragraph_format.line_spacing = line_spacing
                p.paragraph_format.space_before = Pt(space_before_pt)
                p.paragraph_format.space_after = Pt(space_after_pt)
                _add_inline_html_runs(p, block.get("html") or block.get("text") or "", font_name, font_size_pt)

    # -----------------------------------------------------------------------
    # D. Section Daftar Pustaka (Hanging Indent)
    # -----------------------------------------------------------------------
    final_bib = payload.get("finalBib") or []
    cit_style = str(payload.get("citStyle") or "apa").lower()
    if final_bib:
        _get_or_add_section(num_mode, "decimal" if body_sec_count == 0 else None, 1 if body_sec_count == 0 else None)
        h = doc.add_paragraph(style="Heading 1")
        _set_run_font(h.add_run("DAFTAR PUSTAKA"), font_name)

        for item in final_bib:
            p = doc.add_paragraph()
            p.alignment = body_align
            p.paragraph_format.line_spacing = line_spacing
            p.paragraph_format.space_after = Pt(7)
            if cit_style == "ieee":
                p.paragraph_format.left_indent = Cm(1.1)
                p.paragraph_format.first_line_indent = Cm(-1.1)
                _set_run_font(p.add_run(f"[{item.get('num', 1)}]  "), font_name, size_pt=font_size_pt)
            else:
                p.paragraph_format.left_indent = Cm(1.25)
                p.paragraph_format.first_line_indent = Cm(-1.25)
            _add_inline_html_runs(p, item.get("html") or "", font_name, font_size_pt)

    if not section_started:
        _get_or_add_section(num_mode)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()

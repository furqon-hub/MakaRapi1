"""
MakaRapi — Pemeriksa Konsistensi Sitasi ↔ Daftar Pustaka (Citation Cross-Check)
Mendeteksi kutipan in-text (APA/dkk./et al., [@ref], dan IEEE [1]) pada naskah,
lalu mencocokkannya dengan seluruh entri di Daftar Pustaka untuk menemukan:
1. Sitasi yang dikutip di teks tetapi belum tercantum di Daftar Pustaka.
2. Referensi di Daftar Pustaka yang belum pernah dikutip di naskah.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

YEAR_RX = re.compile(r"\b(19\d{2}|20\d{2}[a-z]?)\b", re.I)
# Pola kutipan dalam kurung: (Penulis, 2021) atau (Penulis1 & Penulis2, 2021; Penulis3 dkk., 2020)
PAREN_GROUP_RX = re.compile(r"\(([^()]{4,180})\)")
MANAGED_REF_RX = re.compile(r"\[@([a-zA-Z0-9_-]+)\]")
IEEE_NUM_RX = re.compile(r"\[(\d{1,3})\]")

IGNORE_PREFIXES = {
    "lihat", "misalnya", "misal", "contoh", "contohnya", "seperti", "antara",
    "tahun", "bab", "tabel", "gambar", "halaman", "hal", "pasal", "ayat",
    "undang-undang", "uu", "pp", "permen", "sk", "no", "nomor", "sebagaimana",
}


def _norm_token(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())


def _extract_primary_surname(author_chunk: str) -> str:
    """Ambil kata kunci nama belakang penulis pertama (atau lembaga seperti UNESCO)."""
    cleaned = re.sub(r"\b(?:dkk\.?|et\s+al\.?|and|dan)\b", " ", author_chunk, flags=re.I)
    cleaned = re.split(r"[&,;]", cleaned)[0].strip()
    cleaned = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ0-9\- ]+", " ", cleaned).strip()
    words = [w for w in cleaned.split() if len(w) >= 2]
    if not words:
        return ""
    if words[0].lower() in IGNORE_PREFIXES:
        return ""
    # Ambil kata utama terakhir bila nama lengkap ("Budi Santoso" -> "Santoso"),
    # atau kata pertama bila sudah berbentuk nama belakang/singkatan ("UNESCO", "Zawacki-Richter")
    return words[-1]


def _extract_bib_key(entry_text: str) -> Tuple[str, str]:
    """Ekstrak (surname_norm, year) dari satu baris entri Daftar Pustaka."""
    plain = re.sub(r"<[^>]+>", "", str(entry_text or "")).strip()
    ym = YEAR_RX.search(plain)
    year = ym.group(1).lower() if ym else ""

    # Bagian sebelum tahun biasanya berisi nama penulis
    before_year = plain[: ym.start()] if ym else plain[:80]
    before_year = re.sub(r"^\[\d+\]\s*", "", before_year).strip()

    # Format APA: "Zawacki-Richter, O., ..." -> bagian sebelum koma pertama adalah surname
    if "," in before_year:
        first_part = before_year.split(",", 1)[0].strip()
    else:
        first_part = before_year.split(".", 1)[0].strip()

    # Jika format IEEE "S. Russell & P. Norvig", ambil kata terakhir di segmen pertama
    first_part = re.split(r"[&;]|(?:\bdan\b|\band\b)", first_part, flags=re.I)[0].strip()
    words = [w for w in re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ0-9\- ]+", " ", first_part).split() if len(w) >= 2]
    surname = words[-1] if words else ""
    return (_norm_token(surname), year)


def _extract_intext_citations(content: str, managed_by_id: Dict[str, Dict[str, Any]], cit_style: str) -> List[Dict[str, str]]:
    """Kumpulkan semua kutipan in-text unik dari naskah."""
    # Hapus blok [TABEL]...[/TABEL] dan tag [GAMBAR ...] agar tidak salah baca atribut sumber
    stripped = re.sub(r"\[GAMBAR[^\]]*\]", " ", str(content or ""), flags=re.I)
    stripped = re.sub(r"\[TABEL[^\]]*\]", " ", stripped, flags=re.I)
    stripped = re.sub(r"\[\/TABEL\]", " ", stripped, flags=re.I)

    found: List[Dict[str, str]] = []
    seen_keys = set()

    # 1. Kutipan terkelola [@ref1]
    for m in MANAGED_REF_RX.finditer(stripped):
        ref_id = m.group(1)
        cit = managed_by_id.get(ref_id)
        if cit:
            first_auth = str(cit.get("authors") or "").split(";")[0].strip()
            surname = _extract_primary_surname(first_auth)
            year = str(cit.get("year") or "").strip().lower()
            key = f"managed:{ref_id}"
            if key not in seen_keys:
                seen_keys.add(key)
                found.append({
                    "raw": f"[@{ref_id}] ({surname}, {year})" if surname else f"[@{ref_id}]",
                    "surname": _norm_token(surname),
                    "year": year,
                    "refId": ref_id,
                })
        else:
            key = f"missing_ref:{ref_id}"
            if key not in seen_keys:
                seen_keys.add(key)
                found.append({"raw": f"[@{ref_id}]", "surname": "", "year": "", "refId": ref_id})

    # 2. Kutipan dalam kurung (Penulis, Tahun) — mendukung multi-sitasi dipisah ';'
    for gm in PAREN_GROUP_RX.finditer(stripped):
        inside = gm.group(1).strip()
        for part in inside.split(";"):
            part = part.strip()
            ym = YEAR_RX.search(part)
            if not ym:
                continue
            before = part[: ym.start()].strip().rstrip(", ")
            if not before or len(before) < 2:
                continue
            surname = _extract_primary_surname(before)
            if not surname or len(surname) < 2:
                continue
            year = ym.group(1).lower()
            s_norm = _norm_token(surname)
            key = f"ay:{s_norm}:{year}"
            if key not in seen_keys:
                seen_keys.add(key)
                found.append({
                    "raw": f"({part})",
                    "surname": s_norm,
                    "year": year,
                    "refId": "",
                })

    # 3. Kutipan numerik IEEE [1], [2] jika gaya IEEE dan ada angka sitasi
    if cit_style == "ieee":
        for nm in IEEE_NUM_RX.finditer(stripped):
            num_str = nm.group(1)
            key = f"ieee:{num_str}"
            if key not in seen_keys:
                seen_keys.add(key)
                found.append({"raw": f"[{num_str}]", "surname": "", "year": "", "ieeeNum": num_str, "refId": ""})

    return found


def audit_citations(payload: Dict[str, Any]) -> Dict[str, Any]:
    content = str(payload.get("content") or "")
    managed_list = payload.get("citations") or []
    manual_bib_raw = str(payload.get("manualBibliography") or "")
    cit_style = str(payload.get("citationStyle") or "apa").lower()

    managed_by_id = {str(c.get("id")): c for c in managed_list if c and c.get("id")}

    # Susun daftar entri Daftar Pustaka (dari tab Sitasi + manual)
    bib_entries: List[Dict[str, Any]] = []
    for idx, c in enumerate(managed_list, start=1):
        first_auth = str(c.get("authors") or "").split(";")[0].strip()
        surname = _extract_primary_surname(first_auth)
        year = str(c.get("year") or "").strip().lower()
        label = f"{first_auth} ({c.get('year', '')}). {c.get('title', '')}".strip()
        bib_entries.append({
            "index": idx,
            "refId": str(c.get("id") or ""),
            "surname": _norm_token(surname),
            "year": year,
            "label": label,
            "plain": label.lower(),
            "cited": False,
        })

    manual_lines = [l.strip() for l in manual_bib_raw.replace("\r\n", "\n").splitlines() if l.strip()]
    for line in manual_lines:
        s_norm, year = _extract_bib_key(line)
        plain = re.sub(r"<[^>]+>", "", line).strip()
        bib_entries.append({
            "index": len(bib_entries) + 1,
            "refId": "",
            "surname": s_norm,
            "year": year,
            "label": plain[:110] + ("..." if len(plain) > 110 else ""),
            "plain": plain.lower(),
            "cited": False,
        })

    in_text = _extract_intext_citations(content, managed_by_id, cit_style)

    matched: List[str] = []
    missing_in_bib: List[str] = []

    for cit in in_text:
        hit: Optional[Dict[str, Any]] = None
        if cit.get("refId"):
            hit = next((b for b in bib_entries if b["refId"] == cit["refId"]), None)
        elif cit.get("ieeeNum"):
            num_i = int(cit["ieeeNum"])
            hit = next((b for b in bib_entries if b["index"] == num_i), None)
        else:
            s_norm = cit["surname"]
            year = cit["year"]
            # Cocokkan berdasarkan surname + tahun (atau surname muncul di entri + tahun sama)
            for b in bib_entries:
                year_ok = (not year) or (b["year"] == year) or (year in b["plain"])
                name_ok = bool(s_norm) and (
                    b["surname"] == s_norm
                    or (len(s_norm) >= 4 and s_norm in re.sub(r"[^a-z0-9]+", "", b["plain"][:80]))
                )
                if year_ok and name_ok:
                    hit = b
                    break

        if hit is not None:
            hit["cited"] = True
            matched.append(cit["raw"])
        else:
            missing_in_bib.append(cit["raw"])

    uncited_in_body = [b["label"] for b in bib_entries if not b["cited"]]

    total_checks = len(matched) + len(missing_in_bib) + len(uncited_in_body)
    if total_checks == 0:
        score = 100
    else:
        score = int(round((len(matched) / total_checks) * 100))

    return {
        "engine": "python-citation-audit",
        "inTextCount": len(in_text),
        "bibCount": len(bib_entries),
        "matchedCount": len(matched),
        "matched": matched,
        "missingInBib": missing_in_bib,
        "uncitedInBody": uncited_in_body,
        "score": score,
    }

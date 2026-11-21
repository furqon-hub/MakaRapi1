"""
MakaRapi — Pemeriksa Tata Tulis Akademik Indonesia (Rule-Based Academic Linter)
1. Memperbaiki kata tidak baku umum sesuai KBBI (mempertahankan kapitalisasi asli).
2. Memiringkan istilah asing akademik umum (<i>...</i>) tanpa membungkus ulang
   teks yang sudah miring dan tanpa menyentuh tag [TABEL]/[GAMBAR], judul BAB, atau URL.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

# Pasangan kata tidak baku -> baku KBBI yang paling sering ditemukan di makalah mahasiswa
KBBI_NONSTANDARD_MAP: Dict[str, str] = {
    "analisa": "analisis",
    "menganalisa": "menganalisis",
    "resiko": "risiko",
    "beresiko": "berisiko",
    "praktek": "praktik",
    "mempraktekkan": "mempraktikkan",
    "dipraktekkan": "dipraktikkan",
    "sistim": "sistem",
    "aktifitas": "aktivitas",
    "efektifitas": "efektivitas",
    "produktifitas": "produktivitas",
    "kreatifitas": "kreativitas",
    "objektifitas": "objektivitas",
    "subjektifitas": "subjektivitas",
    "kwalitas": "kualitas",
    "kwantitas": "kuantitas",
    "tekhnologi": "teknologi",
    "teknik": "teknik",
    "tekhnik": "teknik",
    "sekedar": "sekadar",
    "merubah": "mengubah",
    "dirubah": "diubah",
    "rubah": "ubah",
    "standart": "standar",
    "standard": "standar",
    "metoda": "metode",
    "hipotesa": "hipotesis",
    "diagnosa": "diagnosis",
    "sintesa": "sintesis",
    "konkrit": "konkret",
    "komplit": "komplet",
    "ijin": "izin",
    "mengijinkan": "mengizinkan",
    "jadwal": "jadwal",
    "jadual": "jadwal",
    "obyek": "objek",
    "obyektif": "objektif",
    "subyek": "subjek",
    "subyektif": "subjektif",
    "nasehat": "nasihat",
    "hakekat": "hakikat",
    "kaidah": "kaidah",
    "kaedah": "kaidah",
    "paham": "paham",
    "faham": "paham",
    "pikir": "pikir",
    "fikir": "pikir",
    "berfikir": "berpikir",
    "memikirkan": "memikirkan",
    "atlit": "atlet",
    "apotik": "apotek",
    "karir": "karier",
    "profesi": "profesi",
    "hierarki": "hierarki",
    "hirarki": "hierarki",
    "frekwensi": "frekuensi",
    "konskwensi": "konsekuensi",
    "konsekwensi": "konsekuensi",
    "diatas": "di atas",
    "dibawah": "di bawah",
    "didalam": "di dalam",
    "diluar": "di luar",
    "disamping": "di samping",
    "disini": "di sini",
    "disana": "di sana",
    "dimana": "di mana",
    "kemana": "ke mana",
    "daripada": "daripada",
}

# Hanya simpan entri yang benar-benar berubah (baku != tidak baku)
KBBI_FIX_PAIRS: List[Tuple[str, str]] = [
    (wrong, right) for wrong, right in KBBI_NONSTANDARD_MAP.items() if wrong != right
]

# Daftar istilah asing akademik umum (diurutkan terpanjang lebih dulu saat kompilasi regex)
FOREIGN_ACADEMIC_TERMS: List[str] = sorted(
    [
        "artificial intelligence",
        "natural language processing",
        "learning management system",
        "large language models",
        "large language model",
        "machine learning",
        "deep learning",
        "cloud computing",
        "internet of things",
        "blended learning",
        "digital library",
        "neural network",
        "computer vision",
        "generative ai",
        "open source",
        "data mining",
        "big data",
        "e-learning",
        "real-time",
        "framework",
        "prototype",
        "benchmark",
        "interface",
        "algorithm",
        "database",
        "software",
        "hardware",
        "feedback",
        "workflow",
        "dataset",
        "website",
        "chatbot",
        "offline",
        "online",
        "output",
        "input",
        "et al.",
    ],
    key=len,
    reverse=True,
)

KBBI_REGEX = re.compile(
    r"\b(" + "|".join(re.escape(w) for w, _ in KBBI_FIX_PAIRS) + r")\b",
    re.IGNORECASE,
)
FOREIGN_REGEX = re.compile(
    r"(?<![A-Za-z0-9_])(" + "|".join(re.escape(t) for t in FOREIGN_ACADEMIC_TERMS) + r")(?![A-Za-z0-9_])",
    re.IGNORECASE,
)

# Segmen yang tidak boleh disentuh linter: tag <i>...</i>, URL, sitasi [@ref]
PROTECTED_SEG_RX = re.compile(r"(<i>[\s\S]*?<\/i>|https?:\/\/\S+|\[@[a-zA-Z0-9_-]+\])", re.IGNORECASE)
BAB_OR_HEADING_RX = re.compile(r"^(?:#+\s*)?(?:BAB\s+[IVXLCDM0-9]+|[A-Z]\.\s+|\d+\.\d+(?:\.\d+)*\.?\s+)", re.IGNORECASE)


def _match_case(original: str, replacement: str) -> str:
    if original.isupper():
        return replacement.upper()
    if original and original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def lint_academic_text(
    raw_text: str,
    fix_kbbi: bool = True,
    italicize_foreign: bool = True,
) -> Dict[str, Any]:
    lines = str(raw_text or "").replace("\r\n", "\n").split("\n")
    out_lines: List[str] = []
    in_table = False

    kbbi_changes: List[Dict[str, str]] = []
    foreign_changes: List[str] = []
    kbbi_count = 0
    foreign_count = 0

    for line in lines:
        trimmed = line.strip()
        if re.match(r"^\[TABEL\b", trimmed, re.I):
            in_table = True
            out_lines.append(line)
            continue
        if re.match(r"^\[\/TABEL\]$", trimmed, re.I):
            in_table = False
            out_lines.append(line)
            continue
        if re.match(r"^\[GAMBAR\b", trimmed, re.I) or not trimmed:
            out_lines.append(line)
            continue

        is_heading = (not in_table) and bool(BAB_OR_HEADING_RX.match(trimmed)) and len(trimmed) <= 130

        # Pecah baris ke segmen terlindungi (<i>...</i>, URL, [@ref]) dan teks biasa
        parts = PROTECTED_SEG_RX.split(line)
        for idx in range(0, len(parts), 2):
            seg = parts[idx]
            if not seg:
                continue

            if fix_kbbi:
                def _repl_kbbi(m: re.Match) -> str:
                    nonlocal kbbi_count
                    orig = m.group(1)
                    target = KBBI_NONSTANDARD_MAP.get(orig.lower())
                    if not target or target == orig.lower():
                        return orig
                    fixed = _match_case(orig, target)
                    kbbi_count += 1
                    if len(kbbi_changes) < 30:
                        kbbi_changes.append({"from": orig, "to": fixed})
                    return fixed

                seg = KBBI_REGEX.sub(_repl_kbbi, seg)

            if italicize_foreign and not is_heading:
                def _repl_foreign(m: re.Match) -> str:
                    nonlocal foreign_count
                    orig = m.group(1)
                    foreign_count += 1
                    if len(foreign_changes) < 30 and orig.lower() not in {x.lower() for x in foreign_changes}:
                        foreign_changes.append(orig)
                    return f"<i>{orig}</i>"

                seg = FOREIGN_REGEX.sub(_repl_foreign, seg)

            parts[idx] = seg

        out_lines.append("".join(parts))

    return {
        "engine": "python-academic-linter",
        "text": "\n".join(out_lines),
        "kbbiCount": kbbi_count,
        "foreignCount": foreign_count,
        "totalCount": kbbi_count + foreign_count,
        "kbbiChanges": kbbi_changes,
        "foreignTerms": foreign_changes,
    }

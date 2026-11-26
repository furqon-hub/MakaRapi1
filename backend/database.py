"""
MakaRapi — Repositori Database SQLite untuk Profil Pedoman Kampus
Menyediakan penyimpanan persisten (CRUD) profil pedoman akademik di data/makarapi.db.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = (
    Path("/tmp/makarapi.db")
    if (os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
    else ROOT_DIR / "data" / "makarapi.db"
)

BUILTIN_SEED_PROFILES = [
    {
        "slug": "ui_ugm",
        "name": "Pedoman Skripsi Standar (UI/UGM)",
        "institution": "Standar Umum PTN",
        "description": "A4 · 4-4-3-3 cm · Times New Roman 12 pt · Spasi 1.5 · APA",
        "rules": [
            {"key": "paperSize", "label": "Ukuran Kertas", "value": "A4", "displayValue": "A4 (21 x 29,7 cm)"},
            {"key": "marginTop", "label": "Margin Atas", "value": 4, "displayValue": "4 cm"},
            {"key": "marginLeft", "label": "Margin Kiri", "value": 4, "displayValue": "4 cm"},
            {"key": "marginBottom", "label": "Margin Bawah", "value": 3, "displayValue": "3 cm"},
            {"key": "marginRight", "label": "Margin Kanan", "value": 3, "displayValue": "3 cm"},
            {"key": "fontFamily", "label": "Jenis Font", "value": "Times New Roman", "displayValue": "Times New Roman"},
            {"key": "fontSize", "label": "Ukuran Font Isi", "value": 12, "displayValue": "12 pt"},
            {"key": "headingFontSize", "label": "Ukuran Judul BAB", "value": 14, "displayValue": "14 pt"},
            {"key": "lineSpacing", "label": "Spasi Baris", "value": 1.5, "displayValue": "1.5"},
            {"key": "firstIndent", "label": "Indentasi Paragraf", "value": 1.25, "displayValue": "1.25 cm"},
            {"key": "textAlign", "label": "Perataan Teks", "value": "justify", "displayValue": "Rata Kanan-Kiri"},
            {"key": "pageNumberMode", "label": "Penomoran Halaman", "value": "skripsi", "displayValue": "Standar Skripsi"},
            {"key": "citationStyle", "label": "Gaya Sitasi", "value": "apa", "displayValue": "APA 7th Edition"},
        ],
    },
    {
        "slug": "f4_teknik",
        "name": "Pedoman Makalah Fakultas Teknik (F4)",
        "institution": "Fakultas Teknik",
        "description": "F4 · 4-3-3-3 cm · Arial 11 pt · Spasi 1.5 · IEEE",
        "rules": [
            {"key": "paperSize", "label": "Ukuran Kertas", "value": "F4", "displayValue": "F4 / Folio (21,5 x 33 cm)"},
            {"key": "marginTop", "label": "Margin Atas", "value": 4, "displayValue": "4 cm"},
            {"key": "marginLeft", "label": "Margin Kiri", "value": 3, "displayValue": "3 cm"},
            {"key": "marginBottom", "label": "Margin Bawah", "value": 3, "displayValue": "3 cm"},
            {"key": "marginRight", "label": "Margin Kanan", "value": 3, "displayValue": "3 cm"},
            {"key": "fontFamily", "label": "Jenis Font", "value": "Arial", "displayValue": "Arial"},
            {"key": "fontSize", "label": "Ukuran Font Isi", "value": 11, "displayValue": "11 pt"},
            {"key": "headingFontSize", "label": "Ukuran Judul BAB", "value": 12, "displayValue": "12 pt"},
            {"key": "lineSpacing", "label": "Spasi Baris", "value": 1.5, "displayValue": "1.5"},
            {"key": "firstIndent", "label": "Indentasi Paragraf", "value": 1.0, "displayValue": "1 cm"},
            {"key": "textAlign", "label": "Perataan Teks", "value": "justify", "displayValue": "Rata Kanan-Kiri"},
            {"key": "pageNumberMode", "label": "Penomoran Halaman", "value": "top-right", "displayValue": "Pojok Kanan Atas"},
            {"key": "citationStyle", "label": "Gaya Sitasi", "value": "ieee", "displayValue": "IEEE Style"},
        ],
    },
    {
        "slug": "b5_ilmiah",
        "name": "Pedoman Monograf / Karya Ilmiah (B5)",
        "institution": "Publikasi Ilmiah",
        "description": "B5 · 3-3-2.5-2.5 cm · Cambria 11 pt · Spasi 1.15 · APA",
        "rules": [
            {"key": "paperSize", "label": "Ukuran Kertas", "value": "B5", "displayValue": "B5 (17,6 x 25 cm)"},
            {"key": "marginTop", "label": "Margin Atas", "value": 3, "displayValue": "3 cm"},
            {"key": "marginLeft", "label": "Margin Kiri", "value": 3, "displayValue": "3 cm"},
            {"key": "marginBottom", "label": "Margin Bawah", "value": 2.5, "displayValue": "2.5 cm"},
            {"key": "marginRight", "label": "Margin Kanan", "value": 2.5, "displayValue": "2.5 cm"},
            {"key": "fontFamily", "label": "Jenis Font", "value": "Cambria", "displayValue": "Cambria"},
            {"key": "fontSize", "label": "Ukuran Font Isi", "value": 11, "displayValue": "11 pt"},
            {"key": "headingFontSize", "label": "Ukuran Judul BAB", "value": 13, "displayValue": "13 pt"},
            {"key": "lineSpacing", "label": "Spasi Baris", "value": 1.15, "displayValue": "1.15"},
            {"key": "firstIndent", "label": "Indentasi Paragraf", "value": 1.0, "displayValue": "1 cm"},
            {"key": "textAlign", "label": "Perataan Teks", "value": "justify", "displayValue": "Rata Kanan-Kiri"},
            {"key": "pageNumberMode", "label": "Penomoran Halaman", "value": "bottom-center", "displayValue": "Tengah Bawah"},
            {"key": "citationStyle", "label": "Gaya Sitasi", "value": "apa", "displayValue": "APA 7th Edition"},
        ],
    },
]


def _connect(db_path: Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DEFAULT_DB_PATH) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS guideline_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE,
                name TEXT NOT NULL,
                institution TEXT DEFAULT '',
                description TEXT DEFAULT '',
                rules_json TEXT NOT NULL,
                is_builtin INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        for seed in BUILTIN_SEED_PROFILES:
            conn.execute(
                """
                INSERT OR IGNORE INTO guideline_profiles (slug, name, institution, description, rules_json, is_builtin)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (
                    seed["slug"],
                    seed["name"],
                    seed["institution"],
                    seed["description"],
                    json.dumps(seed["rules"], ensure_ascii=False),
                ),
            )
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    try:
        rules = json.loads(row["rules_json"] or "[]")
    except Exception:
        rules = []
    return {
        "id": row["id"],
        "slug": row["slug"] or "",
        "name": row["name"],
        "institution": row["institution"] or "",
        "description": row["description"] or "",
        "rules": rules,
        "isBuiltin": bool(row["is_builtin"]),
        "createdAt": row["created_at"] or "",
    }


def list_guideline_profiles(db_path: Path = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM guideline_profiles ORDER BY is_builtin ASC, id DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_guideline_profile(profile_id: int, db_path: Path = DEFAULT_DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute("SELECT * FROM guideline_profiles WHERE id = ?", (profile_id,)).fetchone()
    return _row_to_dict(row) if row else None


def _summarize_rules(rules: List[Dict[str, Any]]) -> str:
    by_key = {str(r.get("key")): r.get("value") for r in rules if isinstance(r, dict)}
    parts = []
    if by_key.get("paperSize"):
        parts.append(str(by_key["paperSize"]))
    margins = [by_key.get(k) for k in ("marginTop", "marginLeft", "marginBottom", "marginRight")]
    if all(m is not None for m in margins):
        parts.append("-".join(str(m) for m in margins) + " cm")
    if by_key.get("fontFamily"):
        sz = f" {by_key['fontSize']} pt" if by_key.get("fontSize") else ""
        parts.append(f"{by_key['fontFamily']}{sz}")
    if by_key.get("lineSpacing"):
        parts.append(f"Spasi {by_key['lineSpacing']}")
    if by_key.get("citationStyle"):
        parts.append(str(by_key["citationStyle"]).upper())
    return " · ".join(parts) if parts else f"{len(rules)} aturan"


def create_guideline_profile(
    name: str,
    rules: List[Dict[str, Any]],
    institution: str = "",
    description: str = "",
    db_path: Path = DEFAULT_DB_PATH,
) -> Dict[str, Any]:
    init_db(db_path)
    clean_name = str(name or "").strip()
    if not clean_name:
        raise ValueError("Nama profil pedoman wajib diisi.")
    if not isinstance(rules, list) or not rules:
        raise ValueError("Daftar aturan pedoman tidak boleh kosong.")
    desc = str(description or "").strip() or _summarize_rules(rules)

    with _connect(db_path) as conn:
        cur = conn.execute(
            """
            INSERT INTO guideline_profiles (slug, name, institution, description, rules_json, is_builtin)
            VALUES (NULL, ?, ?, ?, ?, 0)
            """,
            (
                clean_name,
                str(institution or "").strip(),
                desc,
                json.dumps(rules, ensure_ascii=False),
            ),
        )
        conn.commit()
        new_id = int(cur.lastrowid)
        row = conn.execute("SELECT * FROM guideline_profiles WHERE id = ?", (new_id,)).fetchone()
    return _row_to_dict(row)


def delete_guideline_profile(profile_id: int, db_path: Path = DEFAULT_DB_PATH) -> bool:
    init_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute("SELECT is_builtin FROM guideline_profiles WHERE id = ?", (profile_id,)).fetchone()
        if not row:
            return False
        if row["is_builtin"]:
            raise ValueError("Profil pedoman bawaan tidak dapat dihapus.")
        conn.execute("DELETE FROM guideline_profiles WHERE id = ?", (profile_id,))
        conn.commit()
    return True

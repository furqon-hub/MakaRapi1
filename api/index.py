"""
MakaRapi — Entrypoint Vercel Python Serverless Function (ASGI FastAPI)
Mengekspor instance FastAPI `app` untuk menangani seluruh rute /api/*.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.main import app  # noqa: E402, F401

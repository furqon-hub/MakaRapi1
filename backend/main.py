"""
MakaRapi — Hybrid Backend API Server (FastAPI + python-docx + pypdf)
Menyajikan API pemrosesan .docx & pedoman kampus sekaligus file statis frontend.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .academic_linter import lint_academic_text
from .citation_checker import audit_citations
from .database import (
    create_guideline_profile,
    delete_guideline_profile,
    get_guideline_profile,
    init_db,
    list_guideline_profiles,
)
from .docx_builder import build_docx_from_payload
from .docx_parser import parse_docx_bytes
from .guideline_parser import extract_guideline_text
from .pdf_exporter import convert_docx_bytes_to_pdf, find_soffice_executable
from .readiness_checker import audit_document_readiness
from .security import (
    SECURITY_HEADERS,
    SlidingWindowRateLimiter,
    get_allowed_cors_origins,
    validate_docx_zip_safety,
    validate_guideline_upload_safety,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
init_db()

app = FastAPI(
    title="MakaRapi Hybrid API",
    description="Backend Python (FastAPI + python-docx) untuk parsing & generasi makalah .docx presisi.",
    version="1.2.0",
)

api_rate_limiter = SlidingWindowRateLimiter(max_requests=120, window_seconds=60)
heavy_rate_limiter = SlidingWindowRateLimiter(max_requests=30, window_seconds=60)
HEAVY_API_PATHS = {"/api/parse-docx", "/api/parse-guideline", "/api/export-docx", "/api/export-pdf"}

# CORS terukur: origin dev lokal + Capacitor + env MAKARAPI_ALLOWED_ORIGINS untuk produksi HTTPS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)


@app.middleware("http")
async def owasp_security_middleware(request: Request, call_next):
    path = request.url.path or "/"
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "local")
    )

    rate_limit_headers: Dict[str, str] = {}
    if path.startswith("/api/") and request.method != "OPTIONS":
        limiter = heavy_rate_limiter if path in HEAVY_API_PATHS else api_rate_limiter
        bucket = f"{client_ip}:{'heavy' if path in HEAVY_API_PATHS else 'std'}"
        allowed, remaining, retry_after = limiter.check(bucket)
        rate_limit_headers["X-RateLimit-Limit"] = str(limiter.max_requests)
        rate_limit_headers["X-RateLimit-Remaining"] = str(remaining)
        if not allowed:
            resp = JSONResponse(
                status_code=429,
                content={"detail": "Terlalu banyak permintaan. Coba kembali beberapa saat lagi."},
                headers={**SECURITY_HEADERS, **rate_limit_headers, "Retry-After": str(retry_after)},
            )
            return resp

    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    for k, v in rate_limit_headers.items():
        response.headers[k] = v
    if path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "MakaRapi Hybrid Backend",
        "engine": "python-docx",
        "pdfEngine": "libreoffice" if find_soffice_executable() else "browser-print",
        "owaspHardened": True,
        "pwaReady": True,
        "version": "1.2.0",
    }


@app.post("/api/parse-docx")
async def api_parse_docx(file: UploadFile = File(...)) -> Dict[str, Any]:
    file_name = file.filename or "makalah.docx"
    if not file_name.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Format berkas tidak didukung. Hanya menerima file Microsoft Word (.docx).")

    raw = await file.read()
    validate_docx_zip_safety(raw)

    try:
        result = parse_docx_bytes(raw, file_name)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Gagal membaca struktur .docx: {exc}") from exc

    if not result.get("bodyText"):
        raise HTTPException(status_code=422, detail="Berkas .docx tidak mengandung teks yang dapat dibaca.")
    return result


@app.post("/api/parse-guideline")
async def api_parse_guideline(file: UploadFile = File(...)) -> Dict[str, Any]:
    file_name = file.filename or "pedoman.pdf"
    raw = await file.read()
    validate_guideline_upload_safety(raw, file_name)
    try:
        return extract_guideline_text(raw, file_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Gagal membaca berkas pedoman: {exc}") from exc


@app.post("/api/audit-citations")
async def api_audit_citations(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return audit_citations(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal memeriksa konsistensi sitasi: {exc}") from exc


@app.post("/api/audit-readiness")
async def api_audit_readiness(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return audit_document_readiness(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal melakukan audit kelayakan dokumen: {exc}") from exc


@app.post("/api/lint-academic")
async def api_lint_academic(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return lint_academic_text(
            raw_text=str(payload.get("text") or ""),
            fix_kbbi=bool(payload.get("fixKbbi", True)),
            italicize_foreign=bool(payload.get("italicizeForeign", True)),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal memproses linter akademik: {exc}") from exc


@app.get("/api/guidelines")
def api_list_guidelines() -> Dict[str, Any]:
    return {"items": list_guideline_profiles()}


@app.post("/api/guidelines")
async def api_create_guideline(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        item = create_guideline_profile(
            name=str(payload.get("name") or ""),
            rules=payload.get("rules") or [],
            institution=str(payload.get("institution") or ""),
            description=str(payload.get("description") or ""),
        )
        return {"item": item}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan profil pedoman: {exc}") from exc


@app.delete("/api/guidelines/{profile_id}")
def api_delete_guideline(profile_id: int) -> Dict[str, Any]:
    try:
        deleted = delete_guideline_profile(profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Profil pedoman tidak ditemukan.")
    return {"deleted": True, "id": profile_id}


@app.get("/api/guidelines/{profile_id}")
def api_get_guideline(profile_id: int) -> Dict[str, Any]:
    item = get_guideline_profile(profile_id)
    if not item:
        raise HTTPException(status_code=404, detail="Profil pedoman tidak ditemukan.")
    return {"item": item}


@app.post("/api/export-docx")
async def api_export_docx(payload: Dict[str, Any]) -> Response:
    try:
        docx_bytes = build_docx_from_payload(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal membangun dokumen .docx: {exc}") from exc

    raw_title = str((payload.get("cover") or {}).get("title") or "Makalah_MakaRapi")
    safe_name = re.sub(r"[^a-z0-9]+", "_", raw_title.lower()).strip("_")[:60] or "makalah_makarapi"

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.docx"',
            "X-MakaRapi-Engine": "python-docx",
        },
    )


@app.post("/api/export-pdf")
async def api_export_pdf(payload: Dict[str, Any]) -> Response:
    if not find_soffice_executable():
        raise HTTPException(
            status_code=501,
            detail="LibreOffice belum terpasang di server. Gunakan mode cetak PDF browser.",
        )
    try:
        docx_bytes = build_docx_from_payload(payload)
        pdf_bytes = convert_docx_bytes_to_pdf(docx_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal mengonversi PDF: {exc}") from exc

    raw_title = str((payload.get("cover") or {}).get("title") or "Makalah_MakaRapi")
    safe_name = re.sub(r"[^a-z0-9]+", "_", raw_title.lower()).strip("_")[:60] or "makalah_makarapi"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.pdf"',
            "X-MakaRapi-Engine": "libreoffice-pdf",
        },
    )


# ---------------------------------------------------------------------------
# Sajikan Frontend Statis (home.html, index.html, css/, js/) pada origin yang sama
# ---------------------------------------------------------------------------
if (ROOT_DIR / "css").is_dir():
    app.mount("/css", StaticFiles(directory=str(ROOT_DIR / "css")), name="css")
if (ROOT_DIR / "js").is_dir():
    app.mount("/js", StaticFiles(directory=str(ROOT_DIR / "js")), name="js")
if (ROOT_DIR / "icons").is_dir():
    app.mount("/icons", StaticFiles(directory=str(ROOT_DIR / "icons")), name="icons")


@app.get("/manifest.webmanifest")
def serve_manifest():
    return FileResponse(str(ROOT_DIR / "manifest.webmanifest"), media_type="application/manifest+json")


@app.get("/sw.js")
def serve_service_worker():
    return FileResponse(
        str(ROOT_DIR / "sw.js"),
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"},
    )


@app.get("/")
def serve_root():
    return FileResponse(str(ROOT_DIR / "home.html"))


@app.get("/home.html")
def serve_home():
    return FileResponse(str(ROOT_DIR / "home.html"))


@app.get("/index.html")
def serve_workbench():
    return FileResponse(str(ROOT_DIR / "index.html"))

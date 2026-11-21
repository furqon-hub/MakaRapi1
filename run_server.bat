@echo off
title MakaRapi Hybrid Server (FastAPI + python-docx)
cd /d "%~dp0"
echo ============================================================
echo   MakaRapi Hybrid Server
echo   Buka di browser: http://127.0.0.1:8000
echo ============================================================
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause

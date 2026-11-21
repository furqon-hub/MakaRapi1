FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Dependensi Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Salin seluruh kode aplikasi MakaRapi (Backend FastAPI + Frontend PWA)
COPY backend ./backend
COPY css ./css
COPY js ./js
COPY icons ./icons
COPY home.html index.html manifest.webmanifest sw.js ./

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

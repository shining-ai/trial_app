FROM python:3.12-slim

# Chromium の実行に必要なシステムライブラリと日本語フォント
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium のみインストール（Firefox/WebKit は不要）
RUN playwright install chromium

COPY scraper.py to_excel.py ./

RUN mkdir -p /app/output

ENTRYPOINT ["python", "scraper.py"]

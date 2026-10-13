# @playwright/test と同じバージョンのイメージを使う(ブラウザのバージョンを揃えるため)
FROM mcr.microsoft.com/playwright:v1.63.0-noble

# テスト用の動画を作り、ダウンロードした動画を調べるために FFmpeg を入れる
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /e2e

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npx", "playwright", "test"]

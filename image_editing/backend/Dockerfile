# Python 3.12 の公式イメージを使用
FROM python:3.12

RUN apt-get update && apt-get install -y ffmpeg

# 作業ディレクトリを /app に設定
WORKDIR /app

# 依存関係のインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ソースコードをコンテナ内にコピー
COPY . .

# Django API アプリを起動
CMD ["python", "manage.py", "runserver", "--settings", "config.settings.dev", "0.0.0.0:8001"]

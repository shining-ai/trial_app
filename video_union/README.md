# 動画結合アプリ


## イメージ作成
```
docker build -t video-concat .
```

## 起動方法

Dockerの起動
```
docker run -itd --name ffmpeg -v $(pwd):/app -p 8000:8000 video-concat /bin/bash
```


FastAPIの起動
```
uv run uvicorn src.api:app --host 0.0.0.0 --port 8000
```

ブラウザで `http://localhost:8000/` を開くと Web UI が表示されます。

## 主要ファイル

- `src/api.py` - FastAPI エンドポイント（アップロード/一覧/テキスト作成/結合/静的配信）。
- `src/make_text.py` - テキスト描画動画を作成するユーティリティ。
- `src/concat.py` - ffmpeg を使った動画結合ロジック。
- `static/index.html` - 簡易フロントエンド UI。
- アップロードと出力はプロジェクトルートの `uploads/` に保存されます。

## API の使い方（例）

ファイルアップロード:

```bash
curl -F "file=@/path/to/video1.mp4" http://localhost:8000/upload
```

テキスト動画作成:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"text":"こんにちは"}' http://localhost:8000/make_text
```

結合（`uploads/` 内のファイル名を指定）:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"videos":["a.mp4","text_123.mp4","b.mp4"], "output":"merged.mp4"}' \
  http://localhost:8000/concat
```


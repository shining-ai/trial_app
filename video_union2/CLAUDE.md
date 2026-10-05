# 動画結合アプリ

複数の動画をアップロードし、順番を決めて1本に結合し、ダウンロードできるWebアプリ。

## 技術スタック
- バックエンド: Python + FastAPI
- フロントエンド: React + Vite(開発サーバーのみで動かす。本番ビルドは作らない)
- 動画処理: FFmpeg(バックエンドのコンテナに入れる)
- 実行環境: Docker Compose(`backend` と `frontend` の2サービス)
- データベースは使わない。アップロードされた動画と結合結果はvolumeをマウントしたディスクに保存する

## ディレクトリ構成
- `backend/` — バックエンド(FastAPI)
- `backend/app/features/` — 機能ごとのAPIと処理(upload: アップロード、merge: 並び順に沿った結合、download: 結合結果の配信)
- `backend/app/lib/` — 機能横断の共通処理(設定、ログ、子プロセス実行、ディスク保存など)
- `backend/tests/` — 単体テスト(unit/)と結合テスト(integration/)、テスト用動画(fixtures/)
- `frontend/` — フロントエンド(React + Vite)
- `frontend/src/app/` — アプリの起動と画面全体の組み立て
- `frontend/src/features/` — 機能ごとの画面とAPI呼び出し(バックエンドと同じ機能名で区切る)
- `frontend/src/lib/` — フロントエンドの共通処理
- `frontend/tests/` — フロントエンドの単体テスト
- `e2e/` — Playwrightによるアプリ全体の通しテスト
- `.claude/rules/` — 開発ルール

## 設計の原則
- 1ファイル1責務(ファイルの担当を一文で言えること)
- トップレベルは機能単位で区切り、どこに何があるかわかる構成にする

## 主要コマンド
- 起動: `docker compose up`

### backend
- ビルド: `docker compose build backend`
- テスト: `docker compose run --rm backend pytest`

### frontend
- ビルド: `docker compose build frontend`
- テスト: `docker compose run --rm frontend npx vitest run`

### e2e
- 準備: `cd e2e && npm ci && npx playwright install`
- テスト: `cd e2e && npx playwright test`(`docker compose up` でアプリを起動してから実行する)

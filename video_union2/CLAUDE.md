# 動画結合アプリ

複数の動画をアップロードし、順番を決めて1本に結合し、ダウンロードできるWebアプリ。

## 技術スタック
- バックエンド: Python + FastAPI。動画の結合はバックエンドのコンテナ上のFFmpegで行う
- フロントエンド: React + Vite(開発サーバーのみで動かす。本番ビルドは作らない)
- 実行環境: Docker Compose(`backend` と `frontend` の2サービス)
- データベースは使わない。アップロードされた動画と結合結果はvolumeをマウントしたディスクに保存する

## ディレクトリ構成
- `compose.yaml` — サービス定義と保存用volume
- `backend/app/features/` — 機能ごとのコード(upload: アップロード、merge: 並び順に沿った結合、download: 結合結果の配信)
- `backend/app/lib/` — 機能横断の共通処理(設定、ログ、子プロセス実行、ディスク保存など)
- `backend/tests/` — 単体テスト(unit/)と結合テスト(integration/)
- `frontend/src/features/` — 機能ごとの画面とAPI呼び出し(バックエンドと同じ機能名で区切る)
- `frontend/src/lib/` — フロントエンドの共通処理
- `e2e/` — Playwrightによるアプリ全体の通しテスト
- `.claude/rules/` — 開発ルール
- `docs/product.md` — プロダクトの目的、対象ユーザー、ゴール

## 設計の原則
- 1ファイル1責務(ファイルの担当を一文で言えること)
- トップレベルは機能単位で区切り、どこに何があるかわかる構成にする

## 主要コマンド
- `docker compose up --build` — アプリ起動
- `docker compose exec backend pytest` — バックエンドのテスト
- `docker compose exec frontend npx vitest run` — フロントエンドのテスト
- `cd e2e && npx playwright test` — E2Eテスト(アプリ起動中に実行)

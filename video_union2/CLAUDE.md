# 動画結合アプリ

## 技術スタック
- TypeScript + Node.js(Express)。動画の結合はサーバー上のFFmpegで行う
- フロントエンドはReact + Vite
- データベースは使わない。アップロードされた動画と結合結果はサーバーのディスクに保存する

## ディレクトリ構成
- `src/features/` — 機能ごとのコード(upload: 動画のアップロード、merge: 動画の結合)
- `src/lib/` — 機能横断の共通処理(ログなど)
- `tests/` — 単体テスト(unit/)とE2Eテスト(e2e/)
- `.claude/rules/` — 開発ルール

## 主要コマンド
- `npx vitest run` / `npx playwright test` — テスト実行
- `npm run build` — ビルド
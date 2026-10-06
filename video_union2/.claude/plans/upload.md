# プラン1: アップロード

目次と共通の決定事項: [video-merge.md](video-merge.md)

## 1. 概要

動画ファイルをアップロードし、サーバーで動画かどうかと上限を確かめて保存する。画面では複数のファイルを選び、1ファイルごとの進み具合と失敗の理由を一覧に表示する。
あわせて、プラン2・3でも使う共通基盤(設定、ログ、子プロセスの実行、保存先、エラー)を `backend/app/lib/` に作る。

対象の要件: FR-001、FR-008(1本あたりのサイズ・解像度)、FR-009(サイズ・解像度)、FR-013

## 2. 背景

- 結合(プラン2)には、各動画の長さ・表示サイズ・fps・音声の有無が必要になる。アップロード時に ffprobe で調べて保存しておけば、結合時に調べ直さずに済み、画面も合計の長さを出せる(FR-009)
- FastAPI の通常の multipart の受け取りでは、受信の途中で4GBを超えたことを検知して打ち切れない。そのため、本文にファイルをそのまま送る方式にする(Q8)
- スマホの縦動画は、保存上のサイズと表示サイズが違う(回転情報)。判定は表示サイズで行う(Q10)
- 現状のコードは `GET /api/health` と見出しだけの画面のみ。共通基盤はまだない

## 3. 詳細設計

### API

| メソッドとパス | 内容 | 成功 | 失敗 |
|---|---|---|---|
| `POST /api/videos` | 本文に動画ファイルそのもの(`Content-Type: application/octet-stream`)。元のファイル名は `X-File-Name` ヘッダーに URL エンコードして入れる | 201 と `VideoResponse` | 413(4GB超)、422(動画でない・解像度超過・ファイル名の欠落)、507(空き容量不足) |
| `DELETE /api/videos/{video_id}` | アップロード済みの動画とメタ情報を消す | 204 | 404(存在しない・IDの形式が不正) |

`VideoResponse`: `{ "id": str, "file_name": str, "duration_seconds": float, "width": int, "height": int }`(幅・高さは表示サイズ)

エラーの応答は全APIで共通の形にする: `{ "error": { "code": str, "message": str } }`。`message` は画面にそのまま出せる日本語にし、内部のパスやスタックトレースを含めない。

### バックエンドのファイル

**共通基盤 `backend/app/lib/`**

| ファイル | 担当(一文) |
|---|---|
| `config.py` | 環境変数を読み、型付きの設定オブジェクト `Settings` にする |
| `logger.py` | 標準キー(name、request_id、video_ids、err、ms)を付けてログを出す |
| `request_context.py` | リクエストごとに request_id を発行し、ログから参照できるようにするミドルウェア |
| `run_process.py` | 子プロセスを引数のリストで非同期に実行し、終了コード・標準出力・標準エラー出力の末尾を返す。失敗したら logging.md の項目を記録して例外を送出する |
| `disk_storage.py` | IDから保存先のパスを決める。IDの形式(32桁の16進数)を確かめ、保存先の外を指すパスを作らせない |
| `generate_id.py` | 推測されにくいID(uuid4 の16進数)を作る |
| `errors.py` | `AppError(status, code, message)` と、それを共通の形のHTTP応答にするハンドラー |
| `video_catalog.py` | アップロード済み動画のメタ情報をJSONで保存・読み出し・削除する(プラン2の結合からも読む) |
| `disk_space.py` | 保存先の空き容量を返す |
| `cleanup_stale_files.py` | 起動時に、保存先の24時間より古いファイルを消す |

**設定(`Settings`)の項目と既定値**

| 環境変数 | 既定値 | 用途 |
|---|---|---|
| `STORAGE_DIR` | `/data` | 保存先 |
| `MAX_UPLOAD_BYTES` | 4294967296(4GB) | 1本あたりのサイズ上限 |
| `MAX_LONG_SIDE` / `MAX_SHORT_SIDE` | 3840 / 2160 | 解像度の上限(表示サイズの長辺・短辺) |
| `STALE_FILE_HOURS` | 24 | 起動時の掃除の対象 |

プラン2で `MAX_VIDEOS`、`MAX_TOTAL_SECONDS`、`MAX_FPS`、`X264_PRESET`、`X264_CRF` を足す。

**アップロード `backend/app/features/upload/`**

| ファイル | 担当(一文) |
|---|---|
| `router.py` | `POST /api/videos` と `DELETE /api/videos/{video_id}` を受け、処理を呼んで応答を返す |
| `schemas.py` | `VideoResponse` を定義する |
| `receive_upload.py` | リクエスト本文を少しずつディスクに書き、上限を超えたら打ち切って途中のファイルを消す |
| `probe_video.py` | ffprobe を実行して JSON を受け取る |
| `parse_probe_output.py` | ffprobe の JSON から `VideoInfo`(長さ、表示サイズ、fps、音声の有無、静止画かどうか)を作る純粋関数 |
| `validate_video_info.py` | `VideoInfo` が動画として受け付けられるか(映像あり、長さ>0、静止画でない、解像度が上限内)を判定する純粋関数 |
| `upload_video.py` | 受信 → ffprobe → 判定 → メタ情報の保存を順に行い、失敗したら保存したファイルを消す |
| `delete_video.py` | 動画ファイルとメタ情報を消す |

**判定の詳細**

- 表示サイズ: 映像ストリームの `side_data_list` の回転(displaymatrix の `rotation`)が ±90・270 のときは幅と高さを入れ替える
- 長さ: 映像ストリームの `duration` を優先し、ない場合は `format.duration` を使う。どちらもない・0以下なら動画でない
- 静止画: `format_name` が画像形式(`image2`、`png_pipe`、`jpeg_pipe`、`webp_pipe` など)なら動画でない
  - アニメーションGIF(`format_name` が `gif`)も動画でないとして拒否する(要件の「動画」に含めない)
- 解像度: 表示サイズの長辺が `MAX_LONG_SIDE` 以下、かつ短辺が `MAX_SHORT_SIDE` 以下。超えたら「解像度 {幅}x{高さ} は上限 3840x2160 を超えています」
- fps: `avg_frame_rate` を使う(プラン2で出力のfpsを決めるため保存する)
- 映像・音声が複数ある場合は、最初の映像・最初の音声で判定する(Q12)

**保存先のレイアウト**

```
/data/uploads/{video_id}.bin    動画ファイル(元の拡張子は使わない)
/data/uploads/{video_id}.json   メタ情報(元のファイル名、VideoInfo)
```

元のファイル名はメタ情報にだけ保存し、パスには一切使わない。

**main.py**

- `create_app(settings: Settings | None = None)` を用意し、`app = create_app()` とする。テストでは一時ディレクトリと小さい上限を入れた `Settings` で作る
- 起動時(lifespan)に `cleanup_stale_files` を呼ぶ
- request_id のミドルウェアと `AppError` のハンドラーを登録する

### フロントエンドのファイル `frontend/src/features/upload/`

| ファイル | 担当(一文) |
|---|---|
| `types.ts` | `VideoResponse` とアップロード項目の状態(待機中・送信中・完了・失敗)の型を定義する |
| `checkFileSize.ts` | 選んだファイルが4GB以下かを判定する純粋関数 |
| `limitSelection.ts` | 残りの枠(100本 − 一覧の本数 − 送信中の本数)を超えた分を切り捨て、切り捨てた本数を返す純粋関数 |
| `pickNextUploads.ts` | 待機中の項目から、同時送信数(2本)に空きがある分だけ次に送る項目を選ぶ純粋関数 |
| `uploadVideo.ts` | XHR でファイルを送り、進み具合を通知し、応答またはエラーを返す |
| `useUploadQueue.ts` | アップロード項目の状態を管理し、`pickNextUploads` に従って送信を始める。完了した動画を親に渡す |
| `UploadForm.tsx` | ファイル選択(`accept="video/*"`、複数選択)を表示する |
| `UploadList.tsx` | アップロード項目ごとにファイル名・進み具合・失敗の理由を表示する |

- 4GBを超えるファイルは送信せず、一覧に「ファイルサイズが上限の4GBを超えています」と表示する
- 本数の枠を超えて選んだ場合は、超えた分を追加せず「一度に結合できるのは100本までです」と表示する
- 一覧の本数はプラン3の結合リストから受け取る。プラン1の時点では `App.tsx` がアップロード完了の動画を配列で持つ
- APIの共通処理として `frontend/src/lib/apiClient.ts`(fetch を包み、共通のエラー形式を `ApiError` にする)を作る。XHR を使う `uploadVideo.ts` も、エラーの解釈は `apiClient.ts` の関数を使う

### その他

- `compose.yaml` の backend に、`TZ=Asia/Tokyo` を足す(プラン2のファイル名の時刻のため)
- 開発サーバーの転送(Vite の proxy)で4GBの本文が流れることを、実装中に1回確かめる。転送で詰まる場合は、アップロードだけ backend に直接送る(CORS の設定が必要になる)

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| `backend/tests/integration/test_health.py` | `create_app` の導入で、import を `create_app(テスト用Settings)` に変える。期待値は変えない |
| `frontend/tests/unit/app/App.test.tsx` | `App` にアップロード画面が入る。見出しの検証はそのまま通ることを確かめる |
| `e2e/home.spec.ts` | 影響なし(見出しは残る) |

テストの土台として足すもの:
- `backend/tests/support/make_video.py`: FFmpeg の `testsrc`・`color`・`sine` で、サイズ・長さ・fps・色・音声の有無・回転情報を指定して動画を作る
- `backend/tests/conftest.py`: 一時ディレクトリと小さい上限の `Settings`、それを使う `TestClient` の fixture
- `backend/tests/fixtures/not_a_video.mp4`(中身はテキスト)、`still.png`(静止画)

## 5. 新規テストケース

### バックエンド単体(`backend/tests/unit/`)

**`features/upload/test_parse_probe_output.py`**
- 横長 1920x1080・回転なしの JSON から、表示サイズ 1920x1080、長さ、fps、音声ありを取り出す
- 回転 -90 の 1920x1080 は、表示サイズ 1080x1920 になる(90、270 も同様)
- 映像に `duration` がないときは `format.duration` を使う
- 音声ストリームがないときは音声なしになる
- 映像ストリームが2つあるときは最初のものを使う
- `format_name` が `png_pipe` のときは静止画になる
- `format_name` が `gif` のときは静止画として扱う(アニメーションGIFも拒否する)

**`features/upload/test_validate_video_info.py`**
- 3840x2160 ちょうどは受け付ける。3841x2160、3840x2161 は拒否し、メッセージに実際の解像度を含む
- 縦長 2160x3840 ちょうどは受け付ける。2160x3841 は拒否する
- 長さ 0 秒・長さなしは拒否する。0.001 秒は受け付ける
- 映像ストリームなし(音声だけ)は拒否する
- 静止画は拒否する

**`lib/test_disk_storage.py`**
- 32桁の16進数のIDから、保存先の中のパスを返す
- `../etc/passwd`、`/` を含む文字列、31桁・33桁、16進数以外の文字を含むIDは拒否する

**`lib/test_config.py`**
- 環境変数がないときは既定値になる。値があるときはそれを使う。数値でない値はエラーになる

### バックエンド結合(`backend/tests/integration/`。本物の FFmpeg を使う)

**`features/upload/test_upload_api.py`**
- 2秒・640x360・音声ありの動画を送ると201になり、応答の長さ(2.0秒±0.05)・幅・高さが正しく、`.bin` と `.json` が保存される
- 回転情報 90 付きの 640x360 を送ると、応答は 360x640 になる
- 音声なしの動画も201になる
- `not_a_video.mp4`(テキスト)は422になり、保存先にファイルが残らない
- `still.png` は422になり、保存先にファイルが残らない
- 上限を小さくした設定(`MAX_UPLOAD_BYTES` を作った動画のサイズちょうど)で、ちょうどのサイズは201、1バイト超は413になり、途中のファイルが残らない
- 上限を小さくした設定(`MAX_LONG_SIDE=640`、`MAX_SHORT_SIDE=360`)で、640x360 は201、641x360 は422 になり、メッセージに「641x360」を含む
- `X-File-Name` がないと422になる
- `X-File-Name` に `../../etc/passwd` を入れても、保存先の外にファイルができない(保存名はIDだけ)
- `DELETE` で動画とメタ情報が消え、204になる。存在しないIDは404、形式が不正なIDは404
- エラーの応答が `{ "error": { "code", "message" } }` の形で、`message` に保存先のパスを含まない

**`lib/test_run_process.py`**
- 成功したコマンドの標準出力と終了コード0を返す
- 失敗したコマンド(`ffprobe` に存在しないファイル)は例外になり、終了コードと標準エラー出力の末尾を持つ

**`lib/test_cleanup_stale_files.py`**
- 更新時刻が24時間より古いファイルだけを消し、新しいファイルは残す

### フロントエンド単体(`frontend/tests/unit/features/upload/`)

- `checkFileSize.test.ts`: 4GBちょうどは許可、4GB+1バイトは拒否、0バイトは許可(判定はサーバーに任せる)
- `limitSelection.test.ts`: 残り枠3で5ファイル選ぶと3ファイルと切り捨て2を返す。残り枠0なら全部切り捨て。残り枠以内ならそのまま
- `pickNextUploads.test.ts`: 送信中0本なら待機中の先頭2本、送信中1本なら1本、送信中2本なら0本を選ぶ。選ぶ順は選んだ順
- `UploadList.test.tsx`: 送信中は進み具合(%)、失敗は理由のメッセージ、完了は長さと解像度を表示する
- `useUploadQueue.test.ts`: 3ファイルを入れると同時に2本だけ送信が始まり、1本終わると3本目が始まる(`uploadVideo` は、ここでは差し替えて送信の開始と完了を制御する。プロセス外の通信の制御が目的で、成功を返し続けるモックにはしない)

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 0 | 事前タスク(要件定義と testing.md の更新) | メイン(Opus) | [video-merge.md](video-merge.md) の事前タスク。ユーザーの確認を経てコミット |
| 1 | テスト用動画を作る補助関数 `make_video.py` と `conftest.py`、`fixtures/` の2ファイル | Haiku のサブエージェント | 入出力が決まった定型作業。作った動画を ffprobe で確かめるテストを付ける |
| 2 | `config.py`、`errors.py`、`generate_id.py`、`disk_storage.py`、`create_app` への移行 | メイン(Opus) | パストラバーサル対策の要。`test_health.py` の修正を含む |
| 3 | `logger.py`、`request_context.py`、`run_process.py` | メイン(Opus) | logging.md に沿う |
| 4 | `parse_probe_output.py`、`validate_video_info.py`(純粋関数) | メイン(Opus) | 回転・静止画の判定を含む |
| 5 | `receive_upload.py`、`probe_video.py`、`video_catalog.py`、`disk_space.py`、`upload_video.py`、`delete_video.py`、`router.py` | メイン(Opus) | 結合テストで本物の FFmpeg を使う |
| 6 | `cleanup_stale_files.py` と起動時の呼び出し | Sonnet のサブエージェント | 仕様が確定している |
| 7 | フロントの純粋関数(`checkFileSize`、`limitSelection`、`pickNextUploads`)と `apiClient.ts` | Sonnet のサブエージェント | |
| 8 | `uploadVideo.ts`、`useUploadQueue.ts`、`UploadForm.tsx`、`UploadList.tsx`、`App.tsx` への組み込み | Sonnet のサブエージェント | Vite の転送で大きいファイルが流れるかを確かめる |
| 9 | レビュー | `design-reviewer`、`edge-case-reviewer`、`security-reviewer` を並列 | P0・P1 を直したら再レビュー |

- 各タスクは `tdd` スキルで行い、タスクごとにコミットする
- サブエージェントには、このプランの該当タスクの節と `.claude/rules/` を読ませる。完了報告は、テストリストと実装したテストの対応で受け取り、メインが差分を確かめてからコミットする

## 7. コミット前テスト実行

```
docker compose run --rm --build backend pytest
docker compose run --rm --build frontend npx vitest run
docker compose run --rm --build e2e
docker compose --profile e2e down
```

3つともすべて通ることを確かめてからコミットする。

## 8. スコープ外

- アップロードの中断からの再開
- サムネイル・プレビュー(Q19)
- HDR・10bit動画の色の変換(Q11)、非正方形画素の補正(Q17)
- 再読み込み後の一覧の復元(Q7)
- 結合・並べ替え・ダウンロード(プラン2・3)

# プラン1: アップロード

目次と共通の決定事項: [video-merge.md](video-merge.md)

## 1. 概要

動画ファイルをアップロードし、サーバーで動画かどうかと上限を確かめて保存する。画面では複数のファイルを選び、1ファイルごとの進み具合と失敗の理由を一覧に表示する。
あわせて、プラン2・3でも使う共通基盤(設定、ログ、子プロセスの実行、保存先のパス、エラー)を `backend/app/lib/` に作る。

対象の要件: FR-001、FR-008(1本あたりのサイズ・解像度)、FR-009(サイズ・解像度・本数の画面側)、FR-013、FR-015(アップロード動画の削除・起動時の掃除)

## 2. 背景

- 結合(プラン2)には、各動画の長さ・表示サイズ・fps・音声の有無・ファイルサイズが必要になる。アップロード時に ffprobe で調べてメタ情報として保存しておけば、結合時に調べ直さずに済み、画面も合計の長さを出せる(FR-009)
- FastAPI の通常の multipart の受け取りでは、受信の途中で4GBを超えたことを検知して打ち切れない。そのため、本文にファイルをそのまま送る方式にする(Q8)
- スマホの縦動画は、保存上のサイズと表示サイズが違う(回転情報)。判定は表示サイズで行う(Q10)
- FFmpeg・ffprobe は、入力の中身に書かれた参照先(再生リストの中の `file:`・`http:` など)を開く機能を持つ。アップロードされたファイルは信用できないため、開けるプロトコルと入れ物の形式を許可リストで限る(R1)
- 現状のコードは `GET /api/health` と見出しだけの画面のみ。共通基盤はまだない

## 3. 詳細設計

### API

| メソッドとパス | 内容 | 成功 | 失敗 |
|---|---|---|---|
| `POST /api/videos` | 本文に動画ファイルそのもの(`Content-Type: application/octet-stream`)。元のファイル名は `X-File-Name` ヘッダーに URL エンコードして入れる | 201 と `VideoResponse` | 413(4GB超)、422(動画でない・解像度超過・ファイル名の欠落) |
| `DELETE /api/videos/{video_id}` | アップロード済みの動画とメタ情報を消す | 204 | 404(存在しない・IDの形式が不正) |

`VideoResponse`: `{ "id": str, "file_name": str, "duration_seconds": float, "width": int, "height": int }`(幅・高さは表示サイズ)

エラーの応答は全APIで共通の形にする: `{ "error": { "code": str, "message": str } }`。`message` は画面にそのまま出せる日本語にし、内部のパスやスタックトレースを含めない。画面は `message` をそのまま表示する(画面で文言を置き換えない)。

| 場面 | code | message |
|---|---|---|
| 4GB超 | `file_too_large` | 「ファイルサイズが上限の4GBを超えています」 |
| 動画でない(FR-013) | `not_a_video` | 「動画として読み込めませんでした」 |
| 解像度超過 | `resolution_too_large` | 「解像度 {幅}x{高さ} は上限 {上限} を超えています」。上限は横長(幅≧高さ)なら 3840x2160、縦長なら 2160x3840 |
| ファイル名の欠落 | `file_name_required` | 「ファイル名がありません」 |

### バックエンドのファイル

**共通基盤 `backend/app/lib/`**

| ファイル | 担当(一文) |
|---|---|
| `config.py` | 環境変数を読み、型付きの設定オブジェクト `Settings` にする |
| `logger.py` | 標準キー(name、request_id、video_ids、err、ms)を付けてログを出す |
| `request_context.py` | request_id を contextvars で持ち、リクエストごとに発行するミドルウェアと、リクエスト外の処理に固定値を入れる関数を提供する |
| `run_process.py` | 子プロセスを引数のリストで非同期に実行し、標準出力を1行ずつコールバックに渡し、時間の上限を守り、終了コードと標準エラー出力の末尾を返す |
| `disk_storage.py` | 保存先のすべてのパスを、種類ごとの関数で返す。IDの形式を確かめ、保存先の外を指すパスを作らせない |
| `generate_id.py` | 推測されにくいID(uuid4 の16進数32桁)を作る |
| `errors.py` | `AppError(status, code, message)` と、それを共通の形のHTTP応答にするハンドラー |
| `disk_space.py` | 保存先の空き容量を返す(プラン2の結合前の確認で使う) |
| `cleanup_stale_files.py` | 起動時に、保存先の24時間より古いファイルを消す |

**`run_process.py` の詳細**

- 呼び出し: `run_process(args, *, timeout_seconds, on_stdout_line=None) -> ProcessResult(returncode, stderr_tail)`
- 標準出力は1行ずつ `on_stdout_line` に渡す(プラン2の進み具合で使う)。標準エラー出力は末尾の50行を保持する
- `timeout_seconds` を超えたらプロセスを止め、例外を送出する
- 終了コードが0以外・時間切れのときは、引数、終了コード、標準エラー出力の末尾を error で記録して例外(`ProcessFailedError`)を送出する
- 成功のログ: ffmpeg の成功は info で記録する。ffprobe の成功は1秒を超えたときだけ info で記録する(logging.md ルール5)。呼び出し側では成功のログを重ねて出さない
- FFmpeg・ffprobe を実行するのはこの関数だけにする(architecture.md)

**`disk_storage.py` の関数**

| 関数 | 返すパス |
|---|---|
| `upload_video_path(video_id)` | `/data/uploads/{video_id}.bin` |
| `upload_metadata_path(video_id)` | `/data/uploads/{video_id}.json` |
| `upload_temp_path(video_id)` | `/data/uploads/{video_id}.part`(受信中) |
| `merge_job_dir(job_id)` | `/data/merges/{job_id}/`(プラン2) |
| `merge_part_path(job_id, index)` | `/data/merges/{job_id}/parts/{index:04d}.mp4`(プラン2) |
| `merge_list_path(job_id)` | `/data/merges/{job_id}/parts.txt`(プラン2) |
| `merge_result_partial_path(job_id)` | `/data/merges/{job_id}/result.partial.mp4`(プラン2) |
| `merge_result_path(job_id)` | `/data/merges/{job_id}/result.mp4`(プラン2) |
| `uploads_dir()`、`merges_dir()` | 掃除・一覧のためのフォルダ |

- ID は32桁の16進数だけを受け付け、それ以外は `InvalidIdError` を送出する
- 返すパスは `resolve()` したうえで保存先の中にあることを確かめる
- パスの組み立てはこのファイルだけで行い、他のファイルは文字列を連結してパスを作らない

**設定(`Settings`)の項目と既定値**

| 環境変数 | 既定値 | 用途 |
|---|---|---|
| `STORAGE_DIR` | `/data` | 保存先 |
| `MAX_UPLOAD_BYTES` | 4294967296(4GB) | 1本あたりのサイズ上限 |
| `MAX_LONG_SIDE` / `MAX_SHORT_SIDE` | 3840 / 2160 | 解像度の上限(表示サイズの長辺・短辺) |
| `STALE_FILE_HOURS` | 24 | 起動時の掃除の対象 |
| `FFPROBE_TIMEOUT_SECONDS` | 60 | ffprobe の時間の上限 |

プラン2で `MAX_VIDEOS`、`MAX_TOTAL_SECONDS`、`MAX_FPS`、`X264_PRESET`、`X264_CRF`、`FFMPEG_TIMEOUT_PER_SECOND` を足す。

**アップロード `backend/app/features/upload/`**

| ファイル | 担当(一文) |
|---|---|
| `router.py` | `POST /api/videos` と `DELETE /api/videos/{video_id}` を受け、処理を呼んで応答を返す |
| `schemas.py` | `VideoResponse` を定義する |
| `video_info.py` | ffprobe から読み取った動画の情報 `VideoInfo` の型を定義する |
| `receive_upload.py` | リクエスト本文を少しずつ一時ファイルに書き、上限を超えたら打ち切って一時ファイルを消す |
| `build_probe_args.py` | ffprobe の引数(プロトコルと形式の許可リストを含む)を組み立てる純粋関数 |
| `probe_video.py` | `run_process` で ffprobe を実行して JSON を受け取る |
| `parse_probe_output.py` | ffprobe の JSON から `VideoInfo` を作る純粋関数 |
| `validate_video_info.py` | `VideoInfo` が受け付けられるか(許可した形式、映像あり、長さ>0、解像度が上限内)を判定し、エラーの code と message を返す純粋関数 |
| `video_metadata_store.py` | メタ情報ファイルを書き込み・削除する |
| `upload_video.py` | 受信 → ffprobe → 判定 → 本保存(改名)→ メタ情報の書き込みを順に行い、失敗したら作ったファイルを消す |
| `delete_video.py` | 動画ファイルとメタ情報を消す |

`VideoInfo` は upload の中で定義し、`lib/` やプラン2の merge からは import しない。merge はメタ情報ファイル(下の形式)を自分の型で読む。

**判定の詳細**

- ffprobe の引数: `-protocol_whitelist file -format_whitelist {許可リスト} -v error -print_format json -show_format -show_streams -- {パス}`(R1)
- 入れ物の形式の許可リスト: `mov,mp4,m4a,3gp,3g2,mj2`(MP4・MOV)、`matroska,webm`、`avi`、`mpegts`、`mpeg`、`asf`(WMV)、`flv`。ffprobe の `format_name`(例: `mov,mp4,m4a,3gp,3g2,mj2`)の要素のいずれかが許可リストにあれば許可する
  - 再生リスト(`hls`、`concat`)、画像形式(`image2`、`png_pipe` など)、アニメーションGIF(`gif`)は許可リストにないため、「動画として読み込めませんでした」で拒否される
- 表示サイズ: 映像ストリームの `side_data_list` の回転(displaymatrix の `rotation`)が ±90・270 のときは幅と高さを入れ替える
- 長さ: 映像ストリームの `duration` を優先し、ない場合は `format.duration` を使う。どちらもない・0以下なら動画でない
- 解像度: 表示サイズの長辺が `MAX_LONG_SIDE` 以下、かつ短辺が `MAX_SHORT_SIDE` 以下
- fps: `avg_frame_rate` を分数(分子・分母)のまま保存する
- 映像・音声が複数ある場合は、最初の映像・最初の音声で判定する(Q12)

**メタ情報ファイルの形式(プラン2との取り決め)**

```json
{
  "version": 1,
  "id": "32桁の16進数",
  "file_name": "元のファイル名",
  "size_bytes": 12345,
  "duration_seconds": 2.0,
  "width": 640, "height": 360,
  "fps_num": 30, "fps_den": 1,
  "has_audio": true
}
```

- 幅・高さは表示サイズ。元のファイル名はこのファイルにだけ保存し、パスには一切使わない
- 形式を変えるときは `version` を上げ、プラン2の読み出し側と同時に直す

**main.py**

- `create_app(settings: Settings | None = None)` を用意し、`app = create_app()` とする。テストでは一時ディレクトリと小さい上限を入れた `Settings` で作る
- 起動時(lifespan)に、request_id を `startup` にしてから `cleanup_stale_files` を呼ぶ
- request_id のミドルウェアと `AppError` のハンドラーを登録する

### ログ(logging.md)

| レベル | 場面 | 記録する項目 |
|---|---|---|
| info | アップロード完了 | name=`upload.upload_video`、video_ids、ファイルサイズ、解像度、長さ、ms |
| info | 1秒を超えた受け取り | name=`upload.receive_upload`、ファイルサイズ、ms |
| info | ffmpeg の成功・1秒を超えた ffprobe | `run_process.py` が記録 |
| error | 受け取りの失敗(413での打ち切りを含む)、メタ情報の書き込み・削除の失敗、動画の削除の失敗、起動時の掃除の失敗 | name、video_ids(分かるとき)、err、ms |
| error | ffprobe の失敗 | `run_process.py` が記録(引数、終了コード、標準エラー出力の末尾) |

- 元のファイル名とファイルの中身はログに出さない(ルール4)。ファイル名が要るときは video_id で突き合わせる
- 失敗は記録したあと必ず再送出する(ルール3)。`AppError` に変換して応答にするのは `errors.py` のハンドラーだけ
- 失敗の後始末(一時ファイルの削除)がさらに失敗したときは、後始末の失敗も error で記録し、元の例外を再送出する(後始末の例外は元の例外に `add_note` で添える)
- 起動時の掃除で削除に失敗したときも、記録して再送出する(起動は失敗する)

### フロントエンドのファイル `frontend/src/features/upload/`

| ファイル | 担当(一文) |
|---|---|
| `types.ts` | `VideoResponse` とアップロード項目の状態(待機中・送信中・完了・失敗)の型を定義する |
| `checkFileSize.ts` | 選んだファイルが4GB以下かを判定する純粋関数 |
| `limitSelection.ts` | 残りの枠(100本 − 結合リストの本数 − 送信中の本数 − 待機中の本数)を超えた分を切り捨て、切り捨てた本数を返す純粋関数 |
| `pickNextUploads.ts` | 待機中の項目から、同時送信数(2本)に空きがある分だけ次に送る項目を選ぶ純粋関数 |
| `uploadVideo.ts` | XHR でファイルを送り、進み具合を通知し、応答またはエラーを返す |
| `useUploadQueue.ts` | アップロード項目の状態を管理し、`pickNextUploads` に従って送信を始める。完了した動画を親に渡す |
| `UploadForm.tsx` | ファイル選択(`accept="video/*"`、複数選択)を表示する |
| `UploadList.tsx` | アップロード項目ごとにファイル名・進み具合・失敗の理由を表示する |

- 4GBを超えるファイルは送信せず、一覧に「ファイルサイズが上限の4GBを超えています」と表示する
- 本数の枠を超えて選んだ場合は、超えた分を追加せず「一度に結合できるのは100本までです」と表示する
- 1本の送信が失敗しても、他の項目の送信は続ける
- サーバーのエラーは `message` をそのまま表示する
- 結合リストの本数はプラン3の `useMergeQueue` から受け取る。プラン1の時点では `App.tsx` がアップロード完了の動画を配列で持つ
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
- `backend/tests/support/make_video.py`: FFmpeg の `testsrc`・`color`・`sine` で、サイズ・長さ・fps・色・音声の有無・回転情報・入れ物とコーデック(mp4/H.264、webm/VP9、mkv/MPEG-4 Part 2)・可変フレームレートを指定して動画を作る
- `backend/tests/conftest.py`: 一時ディレクトリと小さい上限の `Settings`、それを使う `TestClient` の fixture
- `backend/tests/fixtures/`: `not_a_video.mp4`(中身はテキスト)だけを置く。静止画の PNG、HLS の再生リスト、ffconcat の一覧は、参照先のパスがテストごとに変わるため、テストの中で作る(testing.md「作れないものだけを fixtures に置く」)
- `backend/tests/support/probe.py`(ffprobe の結果を読む)、`sample_pixel.py`(フレームの色を読む。プラン2で使う)

## 5. 新規テストケース

### バックエンド単体(`backend/tests/unit/`)

**`features/upload/test_build_probe_args.py`**
- 引数に `-protocol_whitelist file` と、形式の許可リストの `-format_whitelist` を含む
- パスの直前に `--` があり、`-` で始まるパスもオプションとして解釈されない

**`features/upload/test_parse_probe_output.py`**
- 横長 1920x1080・回転なしの JSON から、表示サイズ 1920x1080、長さ、fps(分数)、音声ありを取り出す
- 回転 -90 の 1920x1080 は、表示サイズ 1080x1920 になる(90、270 も同様)
- 映像に `duration` がないときは `format.duration` を使う
- 映像の `duration=1.0`・`format.duration=2.0`(音声のほうが長い)なら、長さは 1.0(映像の長さで数える。T1)
- 音声ストリームがないときは音声なしになる
- 映像ストリームが2つあるときは最初のものを使う
- 音声ストリームが2つあるときは最初のものを使う(T9)

**`features/upload/test_validate_video_info.py`**
- `format_name` が `mov,mp4,m4a,3gp,3g2,mj2`・`matroska,webm`・`avi`・`mpegts`・`mpeg`・`asf`・`flv` は許可。`png_pipe`・`image2`・`gif`・`apng`・`webp_pipe`・`hls`・`concat` は `not_a_video` と「動画として読み込めませんでした」(T3)
- 3840x2160 ちょうどは受け付ける。3841x2160、3840x2161 は拒否し、「解像度 3841x2160 は上限 3840x2160 を超えています」
- 縦長 2160x3840 ちょうどは受け付ける。2160x3841 は拒否し、「解像度 2160x3841 は上限 2160x3840 を超えています」
- 正方形 2160x2160 は受け付け、2161x2161 は短辺の超過で拒否し、「解像度 2161x2161 は上限 3840x2160 を超えています」(幅≧高さは横長として扱う。T4)
- 長さ 0 秒・長さなしは拒否する。0.001 秒は受け付ける
- 映像ストリームなし(音声だけ)は拒否する

**`lib/test_disk_storage.py`**
- 各関数が、32桁の16進数のIDから保存先の中のパスを返す
- `../etc/passwd`、`/` を含む文字列、31桁・33桁、16進数以外の文字を含むIDは `InvalidIdError`
- `merge_part_path` の連番は4桁のゼロ埋めになる

**`lib/test_config.py`**
- 環境変数がないときは既定値になる。値があるときはそれを使う。数値でない値はエラーになる

**`lib/test_request_context.py`**
- ミドルウェアを通ったリクエストの処理中は、発行された request_id が取れる
- その処理の中で `asyncio.create_task` した処理からも、同じ request_id が取れる
- 起動時用の関数を呼ぶと request_id が `startup` になる

### バックエンド結合(`backend/tests/integration/`。本物の FFmpeg を使う)

**`features/upload/test_upload_api.py`**
- 映像1秒・音声2秒の動画を送ると、応答の長さは 1.0秒±0.05(T1)
- 2秒・640x360・音声ありの動画を送ると201になり、応答の長さ(2.0秒±0.05)・幅・高さが正しく、`.bin` と `.json` が保存され、`.json` が上の形式どおり
- webm/VP9 と mkv/MPEG-4 Part 2 の動画も201になる
- 回転情報 90 付きの 640x360 を送ると、応答は 360x640 になる
- 音声なしの動画も201になる
- `not_a_video.mp4`(テキスト)・`still.png`・`playlist.m3u8`・`list.ffconcat` は422・「動画として読み込めませんでした」になり、保存先にファイルが残らない
- `playlist.m3u8` の検証中に、再生リストが参照する動画ファイルが開かれない(ffprobe が許可リストで拒否する)
- 上限を小さくした設定(`MAX_UPLOAD_BYTES` を作った動画のサイズちょうど)で、ちょうどのサイズは201、1バイト超は413になり、`.part` が残らない
- 上限を小さくした設定(`MAX_LONG_SIDE=640`、`MAX_SHORT_SIDE=360`)で、640x360 は201、641x360 は422 になり、メッセージに「641x360」を含み、`.bin`・`.json`・`.part` が残らない(T6)
- 同じ設定で、回転90の 640x360 は201(表示は 360x640)、回転90の 641x360 は422 でメッセージに「360x641」を含む(T5)
- `X-File-Name` がないと422になる
- `X-File-Name` に `../../etc/passwd` を入れても、保存先の外にファイルができない(保存名はIDだけ)
- `DELETE` で動画とメタ情報が消え、204になる。存在しないIDは404、形式が不正なIDは404
- エラーの応答が `{ "error": { "code", "message" } }` の形で、`message` に保存先のパスを含まない
- アップロード完了の info ログに video_ids と ms があり、元のファイル名を含まない

**`lib/test_run_process.py`**
- 成功したコマンドの終了コード0を返し、標準出力の各行がコールバックに順に渡る
- 失敗したコマンド(`ffprobe` に存在しないファイル)は `ProcessFailedError` になり、終了コードと標準エラー出力の末尾を持つ。error ログに引数・終了コード・標準エラー出力の末尾がある
- `timeout_seconds` を超えるコマンド(`sleep` 相当)は止められ、`ProcessFailedError` になる

**`lib/test_cleanup_stale_files.py`**
- 更新時刻が24時間+1秒前のファイルは消え、24時間-1秒前のファイルは残る(時刻は `os.utime` で設定する。T12)
- 古いジョブのフォルダ(`merges/{job_id}/`)は中身ごと消える
- `uploads/` に消せないもの(中身のあるフォルダ)があると、error を記録して例外を送出する(コンテナは root で動くため、権限では削除の失敗を作れない)
- `create_app` の起動処理(lifespan)を通すと、古いファイルが消える(T12)

### フロントエンド単体(`frontend/tests/unit/features/upload/`)

- `checkFileSize.test.ts`: 4294967296 バイト(サーバーの `MAX_UPLOAD_BYTES` と同じ値)は許可、4294967297 バイトは拒否、0バイトは許可(判定はサーバーに任せる。T17)
- `limitSelection.test.ts`: 残り枠3で5ファイル選ぶと3ファイルと切り捨て2を返す。残り枠0なら全部切り捨て。残り枠以内ならそのまま。結合リスト90本・送信中2本・待機中6本なら残り枠2。結合リスト99本なら残り枠1、100本なら残り枠0(T13)
- `pickNextUploads.test.ts`: 送信中0本なら待機中の先頭2本、送信中1本なら1本、送信中2本なら0本を選ぶ。選ぶ順は選んだ順
- `UploadList.test.tsx`: 送信中は進み具合(%)、失敗はサーバーの `message`、完了は長さと解像度を表示する
- `UploadForm.test.tsx`: 残り枠が0のときはファイル選択を押せず、「一度に結合できるのは100本までです」を表示する(T13)
- `useUploadQueue.test.ts`(`uploadVideo` は差し替えて送信の開始と完了を制御する。プロセス外の通信の制御が目的で、成功を返し続けるモックにはしない)
  - 3ファイルを入れると同時に2本だけ送信が始まり、1本終わると3本目が始まる
  - 4GB超のファイルは `uploadVideo` が呼ばれず、失敗の理由が「ファイルサイズが上限の4GBを超えています」になる
  - 1本が失敗しても、次の項目の送信が始まる

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 0 | 事前タスク(要件定義と testing.md の更新) | — | 反映済み(`ae36a51`) |
| 1 | テスト用動画を作る補助関数 `make_video.py` と `conftest.py`、`fixtures/` の4ファイル | Haiku のサブエージェント | 入出力が決まった定型作業。作った動画を ffprobe で確かめるテストを付ける |
| 2 | `config.py`、`errors.py`、`generate_id.py`、`disk_storage.py`、`create_app` への移行 | メイン(Opus) | パストラバーサル対策の要。`test_health.py` の修正を含む |
| 3 | `logger.py`、`request_context.py`、`run_process.py` | メイン(Opus) | logging.md に沿う。行ごとのコールバックと時間の上限を含む |
| 4 | `video_info.py`、`build_probe_args.py`、`parse_probe_output.py`、`validate_video_info.py`(純粋関数) | メイン(Opus) | 許可リスト・回転の判定を含む |
| 5 | `receive_upload.py`、`probe_video.py`、`video_metadata_store.py`、`upload_video.py`、`delete_video.py`、`router.py` | メイン(Opus) | 結合テストで本物の FFmpeg を使う |
| 6 | `disk_space.py`、`cleanup_stale_files.py` と起動時の呼び出し | Sonnet のサブエージェント | 仕様が確定している |
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
- アップロード時の空き容量の確認(要件にない。結合前だけ確かめる)
- 許可リストにない入れ物の形式(例: RealMedia、Ogg)
- サムネイル・プレビュー(Q19)
- HDR・10bit動画の色の変換(Q11)、非正方形画素の補正(Q17)
- 再読み込み後の一覧の復元(Q7)
- 結合・並べ替え・ダウンロード(プラン2・3)

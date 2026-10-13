# プラン2: 結合とダウンロード(バックエンド)

目次と共通の決定事項: [video-merge.md](video-merge.md)
前提: プラン1([upload.md](upload.md))の共通基盤(`run_process.py`、`disk_storage.py` など)と、メタ情報ファイルの形式が完成していること

## 1. 概要

アップロード済みの動画IDの並びを受け取り、結合ジョブを始める。ジョブは1本ずつ同じ形式の中間ファイルに揃え(1段目)、最後に再エンコードなしでつなぐ(2段目)。進み具合を問い合わせるAPIと、完了した結果のダウンロードAPIを作る。

対象の要件: FR-003〜007、FR-008(本数・結合後の長さ・2本以上・重複)、FR-009(サーバー側の確認)、FR-010〜012、FR-014、FR-015(中間ファイル・結合結果の削除)、FR-016

## 2. 背景

- 4Kが混ざると再エンコードに数十分〜1時間以上かかりうるため、1リクエストで待たせずジョブにする(Q1)
- 100本を1つのFFmpegで同時に開くとメモリが足りなくなるおそれがあり、失敗した動画も特定しにくい。1本ずつ揃えてからつなぐ2段階にする(Q2)
- 出力の形式(解像度・fps・音声)を全体で1つに決めてから各動画を揃えるため、引数の組み立ては純粋関数に分け、FFmpegなしで単体テストする(architecture.md の副作用の分離)
- 利用者は1人なので、ジョブの状態はメモリに持ち、同時に実行できる結合は1件にする(Q1、Q4)
- 長さはファイルのヘッダーの申告値で、実際の長さとは限らない。1段目で長さを打ち切り、子プロセスに時間の上限を設けて、上限のすり抜けとディスクの使い切りを防ぐ(R2)

## 3. 詳細設計

### API

| メソッドとパス | 内容 | 成功 | 失敗 |
|---|---|---|---|
| `POST /api/merges` | 本文 `{ "video_ids": [str, ...] }`(並び順どおり) | 202 と `MergeJobResponse` | 422(本数・重複・長さ・存在しないID・IDの形式)、409(実行中の結合がある)、507(空き容量不足) |
| `GET /api/merges/{job_id}` | ジョブの状態 | 200 と `MergeJobResponse` | 404 |
| `GET /api/merges/{job_id}/download` | 結合結果のファイル。`Content-Disposition: attachment; filename="merged-YYYYMMDD-HHMMSS.mp4"`(完了時刻、Asia/Tokyo) | 200 | 404(存在しない・未完了・失敗・消された) |

`MergeJobResponse`: `{ "id": str, "status": "running" | "succeeded" | "failed", "progress": float(0〜1), "error": { "code", "message" } | null }`

| 場面 | HTTP | code | message |
|---|---|---|---|
| 2本未満 | 422 | `too_few_videos` | 「結合するには2本以上の動画が必要です」 |
| 101本以上 | 422 | `too_many_videos` | 「一度に結合できるのは100本までです」 |
| 重複 | 422 | `duplicate_video` | 「同じ動画が2回指定されています」 |
| 存在しない・形式が不正なID | 422 | `video_not_found` | 「指定された動画が見つかりません」 |
| 30分超過 | 422 | `too_long` | 「結合後の長さが30分を{超過}超えています」(超過は下の書式) |
| 実行中 | 409 | `merge_in_progress` | 「別の結合が実行中です」 |
| 空き容量不足 | 507 | `insufficient_storage` | 「保存先の空き容量が足りません」 |
| ジョブの失敗(`error` に入る) | — | `merge_failed` | 「{n}番目の動画『{元のファイル名}』の変換に失敗しました」(Q16)。2段目・後片付けの失敗は「結合に失敗しました」 |

超過の書式(画面と共通): 超過秒数を秒単位に切り上げ、「{m}分{s}秒」で表す。m が0なら「{s}秒」、s が0なら「{m}分」(例: 0.001秒 → 「1秒」、135秒 → 「2分15秒」、120秒 → 「2分」)。

### 結合の入力の読み出し(merge の中で完結させる)

- merge は upload の `VideoInfo` を import しない。メタ情報ファイル([upload.md](upload.md) の「メタ情報ファイルの形式」)を、merge の型 `MergeSource`(video_id、file_name、size_bytes、duration_seconds、width、height、fps_num、fps_den、has_audio)として読む
- パスは `disk_storage.upload_metadata_path` と `upload_video_path` から受け取る。`version` が1でなければ例外にする

### 出力形式の決め方(純粋関数)

`MergeSource` の列から `OutputFormat` を決める。

- 幅 = 全動画の表示幅の最大値、高さ = 全動画の表示高さの最大値。奇数なら1足して偶数にする(FR-006、FR-010)
- fps = 全動画の fps の最大値。ただし `MAX_FPS`(60)を超えるなら `MAX_FPS`(FR-011)
  - fps は分数(例: 30000/1001)のまま扱い、最大値の比較も分数で行う
- 音声 = AAC、48kHz、ステレオ(FR-012)

### 1段目: 1本ずつ揃える(`build_normalize_args.py`)

各動画について次の引数を組み立てる(入力・出力のパスは引数で受け取る。引数はリストで渡し、シェルを経由しない)。

- 入力の前: `-protocol_whitelist file -format_whitelist {プラン1と同じ許可リスト}`(R1)
- 入力: アップロード動画。音声がない動画は、加えて `-f lavfi -i anullsrc=r=48000:cl=stereo`(lavfi の入力はサーバーが決めた固定の文字列だけ)
- 長さの打ち切り: 出力に `-t {duration_seconds}`(メタ情報の長さ)を付ける(R2)
- 映像のフィルター: `pad={W}:{H}:({W}-iw)/2:({H}-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p`
  - 回転は FFmpeg の自動回転に任せる(フィルターの前に適用される)。拡大はしない(FR-007)
  - `fps` フィルターで固定フレームレートにする。低いフレームレート・可変フレームレートの動画はフレームが複製されて揃う(FR-011)
- 音声のフィルター: `aresample=48000,aformat=channel_layouts=stereo,apad`。出力は `-shortest` で映像の長さに揃える(長い音声は切り、短い音声・無音は埋まる。Q13)
- 使うストリーム: 最初の映像と最初の音声を、メタ情報のストリームの絶対番号で `[0:{番号}]` と選ぶ(音声がない場合は anullsrc)(Q12、I14)
- エンコード: `-c:v libx264 -preset {X264_PRESET} -crf {X264_CRF} -pix_fmt yuv420p -c:a aac -b:a 192k -video_track_timescale 90000`
- 進み具合: `-progress pipe:1 -nostats` を付け、`run_process` の行ごとのコールバックで `out_time_us` を読む
- 時間の上限: `run_process` の `timeout_seconds` = max(60, duration_seconds × `FFMPEG_TIMEOUT_PER_SECOND`)
- 出力: `disk_storage.merge_part_path(job_id, n)`

### 2段目: つなぐ(`build_concat_args.py`、`build_concat_list.py`)

- concat demuxer の一覧ファイルを `disk_storage.merge_list_path(job_id)` に作る。中身はサーバーが作った中間ファイルのパスだけ(利用者の入力を含まない)
- `build_concat_list.py` は、渡されたパスがすべてそのジョブの `parts/` の中にあることを確かめ、外れていれば例外にする
- 引数: `-protocol_whitelist file -f concat -safe 0 -i {一覧} -c copy -movflags +faststart {出力}`(FR-010)
- 出力: `disk_storage.merge_result_partial_path(job_id)`。成功したら `merge_result_path(job_id)` に改名する(未完了の結果がダウンロードから見えないようにする)
- 時間の上限: max(60, 全体の長さ × 1)秒

### 結合の開始(`start_merge.py`)

1. ID の形式・本数・重複・存在・長さの合計・空き容量を確かめる(下の「結合前の確認」)
2. 実行中のジョブがあれば409
3. 前回の結合のフォルダ(`merges_dir()` の中)を消す(FR-015。消すのはここだけ)
4. ジョブを登録し、`asyncio.create_task` で `run_merge_job` を始める。タスクには `add_done_callback` を付け、送出された例外を受け取る(記録は `run_merge_job` で済んでいるため、ここでは受け取るだけ)
5. 202 を返す

request_id は contextvars で持つため、`create_task` したジョブのログにも `POST /api/merges` の request_id が付く。

### ジョブの流れ(`run_merge_job.py`)

1. 1段目を1本ずつ実行し、進み具合を更新する
2. 2段目を実行し、`result.partial.mp4` を作る
3. `parts/` と一覧ファイルを消す
4. `result.partial.mp4` を `result.mp4` に改名し、状態を `succeeded`・進み具合を1.0にする
5. 1〜4 のどこかで例外が起きたら:
   - error で記録する(name=`merge.run_merge_job`、video_ids、失敗した番号と video_id、err、ms。元のファイル名は出さない)
   - `parts/`、一覧ファイル、`result.partial.mp4` を消す。この後始末が失敗したら、それも error で記録し、元の例外に `add_note` で添える
   - 状態を `failed` にし、`error` に message を入れる
   - 元の例外を再送出する(logging.md ルール3)

進み具合 = (完了した動画の長さの合計 + 変換中の動画の `out_time_us`) ÷ 全体の長さ × 0.95。手順4で 1.0 にする(2段目は再エンコードしないため短い)。

### 結合前の確認(`validate_merge_request.py`、純粋関数)

`MergeSource` の列(存在しないIDは呼び出し側で422にしたあと)、空き容量、設定を受け取り、エラーの code と message を返す。

- 本数が2本以上、`MAX_VIDEOS`(100)本以下(Q14、FR-008)
- 同じIDの重複がない(Q15)
- 長さの合計が `MAX_TOTAL_SECONDS`(1800)秒以下。1800.000秒ちょうどは許可(Q13)
- 空き容量 ≧ 入力ファイルの合計サイズ × 2(中間ファイルと結果の分の目安。FR-014)

ID の本数と重複はメタ情報を読む前に `validate_video_ids` で確かめる(I17)。ID の形式と存在は `load_merge_sources.py` が確かめ、どちらも `video_not_found`(422)にする(I4)。

### バックエンドのファイル

**結合 `backend/app/features/merge/`**

| ファイル | 担当(一文) |
|---|---|
| `router.py` | `POST /api/merges` と `GET /api/merges/{job_id}` を受け、処理を呼んで応答を返す |
| `schemas.py` | `MergeRequest` と `MergeJobResponse` を定義する |
| `merge_source.py` | 結合の入力 `MergeSource` の型を定義する |
| `load_merge_sources.py` | メタ情報ファイルを読み、`MergeSource` の列にする(存在しないIDは422) |
| `validate_merge_request.py` | 本数・重複・長さの合計・空き容量を判定する純粋関数 |
| `format_excess.py` | 超過の秒数を「{m}分{s}秒」の文字列にする純粋関数 |
| `plan_output_format.py` | `MergeSource` の列から出力の幅・高さ・fps を決める純粋関数 |
| `build_normalize_args.py` | 1本の動画・出力形式・入出力のパスから、1段目の FFmpeg の引数を組み立てる純粋関数 |
| `build_concat_list.py` | 中間ファイルのパスの列から、concat demuxer の一覧ファイルの中身を作る純粋関数 |
| `build_concat_args.py` | 2段目の FFmpeg の引数を組み立てる純粋関数 |
| `parse_progress.py` | FFmpeg の `-progress` の出力行から、変換済みの時間を取り出す純粋関数 |
| `calculate_progress.py` | 完了した長さ・変換中の時間・全体の長さから進み具合(0〜1)を計算する純粋関数 |
| `merge_job_store.py` | ジョブの状態をメモリに持ち、同時に1件だけ実行させる |
| `run_merge_job.py` | 1段目・2段目を順に実行し、状態の更新・後片付け・失敗の記録を行う |
| `start_merge.py` | 確認 → 前回の結果の削除 → ジョブの登録と開始を行う |

**ダウンロード `backend/app/features/download/`**

| ファイル | 担当(一文) |
|---|---|
| `router.py` | `GET /api/merges/{job_id}/download` を受け、`find_download` の結果を添付ファイルとして返す |
| `find_download.py` | ジョブIDから結果ファイルのパスとダウンロード名を求め、ないときは404の `AppError` を送出する |
| `build_download_name.py` | 完了時刻から `merged-YYYYMMDD-HHMMSS.mp4` を作る純粋関数 |

download はジョブの状態を参照しない。`disk_storage.merge_result_path(job_id)` にファイルがあれば完了とみなし、完了時刻はファイルの更新時刻を使う。成功時にだけ `result.mp4` に改名されるため、実行中・失敗のジョブは404になる。形式が不正な job_id は `InvalidIdError` を404にする。

**設定の追加(`lib/config.py`)**

| 環境変数 | 既定値 |
|---|---|
| `MAX_VIDEOS` | 100 |
| `MAX_TOTAL_SECONDS` | 1800 |
| `MAX_FPS` | 60 |
| `X264_PRESET` | `veryfast` |
| `X264_CRF` | 20 |
| `FFMPEG_TIMEOUT_PER_SECOND` | 20(動画1秒あたりの変換の時間の上限、秒) |

**保存先のレイアウトの追加**(パスはすべて `disk_storage.py` の関数で作る)

```
/data/merges/{job_id}/parts/0001.mp4 ...   中間ファイル(ジョブの終了時に消す)
/data/merges/{job_id}/parts.txt            一覧ファイル(ジョブの終了時に消す)
/data/merges/{job_id}/result.partial.mp4   2段目の出力(成功で改名、失敗で消す)
/data/merges/{job_id}/result.mp4           結合結果(次の結合を始めるときに消す)
```

### ログ(logging.md)

| レベル | 場面 | 記録する項目 |
|---|---|---|
| info | FFmpeg の各実行の成功 | `run_process.py` が記録(呼び出し側では重ねて出さない) |
| info | 結合完了 | name=`merge.run_merge_job`、video_ids、本数、出力の解像度、長さ、ms |
| error | ジョブの失敗 | name=`merge.run_merge_job`、video_ids、失敗した番号と video_id、err、ms |
| error | 後片付け・前回の結果の削除の失敗 | name、video_ids、err |
| error | FFmpeg の失敗・時間切れ | `run_process.py` が記録(引数、終了コード、標準エラー出力の末尾) |

- 元のファイル名はログに出さない(画面向けの message にだけ入れる)

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| プラン1のアップロードの結合テスト | 影響なし。`conftest.py` の fixture を結合テストでも使う |
| `backend/tests/support/make_video.py` | 単色・入れ物とコーデックの指定・可変フレームレートを使う。足りなければ足す |
| フロントエンド・E2E | 影響なし(画面はプラン3) |

フレームの色を確かめる補助として `backend/tests/support/sample_pixel.py`(FFmpeg で指定時刻のフレームを取り出し、指定座標のRGBを返す)を足す。

結合テストの入力は、`POST /api/videos` でアップロードして作る(メタ情報ファイルの形式が upload と merge で食い違っていないことも確かめるため)。

空き容量の不足(507)は、結合テストでは再現できない(空き容量を減らせない)うえ、testing.md は結合テストでアプリ内部をモックすることを禁じている。そのため、判定は `validate_merge_request` の単体テストで確かめ、結合テストには入れない。

## 5. 新規テストケース

### バックエンド単体(`backend/tests/unit/features/`)

**`merge/test_plan_output_format.py`**
- 1920x1080 と 1080x1920 から 1920x1920
- 1919x1079 だけなら 1920x1080(奇数の切り上げ)
- 30fps と 60fps なら 60fps。30000/1001 と 30 なら 30。120fps が混ざれば 60fps(上限)
- 1本だけ渡しても、その動画のサイズと fps になる

**`merge/test_build_normalize_args.py`**
- 640x360 を 1920x1080 に揃える引数に、`pad=1920:1080:(1920-iw)/2:(1080-ih)/2:color=black` を含み、`scale` を含まない
- 入力の前に `-protocol_whitelist file` と `-format_whitelist` がある
- `-t` にメタ情報の長さが入る
- 音声ありの動画はメタ情報の音声の番号(`[0:{番号}]`)を使い、`anullsrc` を含まない
- 音声なしの動画は `anullsrc=r=48000:cl=stereo` の入力を足し、それを使う
- `-shortest`、`-pix_fmt yuv420p`、`-c:a aac`、設定した preset と crf を含む
- 映像のフィルターが `setsar=1`、`fps={fps}`、`format=yuv420p` を含み、映像はメタ情報の映像の番号(`[0:{番号}]`)を使う。音声のフィルターが `aresample=48000`、`aformat=channel_layouts=stereo`、`apad` を含む(T8)
- 引数はすべて文字列のリストで、入力パスが `-` で始まる値として解釈されない位置にある

**`merge/test_build_concat_list.py`**
- パスの列から `file '...'` の行を順番どおりに作る
- パスに `'` を含む場合はエスケープする
- ジョブの `parts/` の外のパス(`/data/uploads/...`、`../` を含むパス)が混ざると例外になる

**`merge/test_build_concat_args.py`**
- `-protocol_whitelist file`、`-f concat -safe 0`、`-c copy`、`-movflags +faststart` を含み、出力が `result.partial.mp4`

**`merge/test_validate_merge_request.py`**
- 2本は許可、1本・0本は `too_few_videos`
- 100本ちょうどは許可、101本は `too_many_videos`(本当の上限値で確かめる)
- 合計 1800.000 秒は許可、1800.001 秒は `too_long` と「結合後の長さが30分を1秒超えています」、1935秒は「…2分15秒超えています」
- 浮動小数の誤差が出る合計でも境界を守る: [600.1, 600.2, 599.7] は許可、[600.1, 600.2, 599.701] は拒否(合計はミリ秒に丸めて比べる。T7)
- 同じIDが2回あると `duplicate_video`
- 空き容量が入力の合計サイズ×2ちょうどなら許可、1バイト足りなければ `insufficient_storage`

**`merge/test_format_excess.py`**
- 0.001 → 「1秒」、59.5 → 「1分」、60 → 「1分」、61 → 「1分1秒」、135 → 「2分15秒」

**`merge/test_parse_progress.py` と `test_calculate_progress.py`**
- `out_time_us=1500000` の行から 1.5 秒を取り出す。関係ない行・`N/A` は無視する
- 全体 10 秒のうち完了 4 秒・変換中 1 秒なら 0.475(×0.95)
- 0 を下回らず、1 を超えない

**`download/test_build_download_name.py`**
- 2026-10-07 09:05:03(Asia/Tokyo)から `merged-20261007-090503.mp4`

### バックエンド結合(`backend/tests/integration/features/`。本物の FFmpeg を使う)

**`merge/test_merge_api.py`**
- 赤(1秒・640x360)・緑(1秒・640x360)・青(1秒・640x360)を赤緑青の順で結合すると、出力の0.5秒・1.5秒・2.5秒のフレームの中央がそれぞれ赤・緑・青になる。順番を青赤緑に変えると、その順になる
- 赤 640x360 と 緑 360x640 を結合すると出力は 640x640 になる。0.5秒のフレームは (320,145) が赤、(320,135) と (320,630) が黒(赤は y=140〜499 にあり、拡大されていない)。1.5秒のフレームは (320,320) が緑、(10,320) と (630,320) が黒(T10)
- 回転情報 90 付きの 640x360 と 640x360 を結合すると、出力は 640x640 になる
- mp4/H.264 と webm/VP9 と mkv/MPEG-4 Part 2 を結合すると成功し、それぞれの区間の色が正しい(FR-005)
- 30fps と 60fps の動画を結合すると、出力は 60fps(ffprobe の `avg_frame_rate`)
- 可変フレームレートの動画と30fpsの動画を結合すると、出力の `avg_frame_rate` と `r_frame_rate` がどちらも30で、フレームの時刻の間隔が一定(FR-011)
- 音声なしの動画と、44.1kHz・モノラルの音声付き動画を結合すると、出力に音声トラックが1つあり、48kHz・2ch(T11)
- 映像2秒・音声1秒の動画と、映像1秒・音声2秒の動画を結合すると、出力の映像と音声の長さがどちらも3秒±1フレームで、最初の区間の1.0〜2.0秒が無音(T2)
- 全動画が音声なしでも、出力に音声トラックがある
- 出力は H.264・yuv420p・AAC で、`moov` がファイルの先頭側にある(faststart)
- 出力の長さが入力の合計と ±1フレーム以内で一致し、`ffmpeg -v error -i 出力 -f null -` がエラーなく最後まで終わる
- 小さい上限の設定(`MAX_TOTAL_SECONDS=2`)で、1秒+1秒は202、1秒+1.5秒は422
- 1本だけ・重複ID・存在しないIDは422
- `video_ids` に `../uploads/x`・31桁の値を入れると422になり、保存先の外のファイルを読まない
- 実行中にもう1件頼むと409(最初の結合が先に終わらないよう、10秒の動画2本で始め、`running` を確かめてから2件目を送る。T16)
- 途中の1本が壊れている(先頭は正しく、途中を切り詰めたファイル)と `failed` になり、「2番目の動画『…』の変換に失敗しました」を返し、`parts/`・`parts.txt`・`result.partial.mp4`・`result.mp4` が残らない
- ジョブの失敗で、error ログに video_ids・失敗した番号・err があり、元のファイル名を含まない。ジョブのタスクの例外は元の例外のまま
- ジョブのログの request_id が、`POST /api/merges` の request_id と一致する
- 成功後に次の結合を始めると、前回のフォルダが消える
- 成功・失敗のどちらでも `parts/` と `parts.txt` が残らない

**`download/test_download_api.py`**
- 完了したジョブの結果を200で返し、`Content-Disposition` のファイル名が `merged-` で始まり `.mp4` で終わる。中身が `result.mp4` と一致する
- 存在しないジョブID・形式が不正なID・実行中(10秒の動画2本で `running` を確かめてから)・失敗したジョブは404(T16)
- ジョブIDに `../uploads/{video_id}` を入れても、アップロード動画を取得できない

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 1 | `sample_pixel.py` と `make_video.py` への色・入れ物・可変フレームレートの指定の追加 | Haiku のサブエージェント | 定型作業。単色動画のピクセルを読むテストを付ける |
| 2 | `merge_source.py`、`load_merge_sources.py`、`plan_output_format.py`、`validate_merge_request.py`、`format_excess.py` と設定の追加 | メイン(Opus) | fps の分数の扱い、メタ情報の読み出しを含む |
| 3 | `build_normalize_args.py`、`build_concat_list.py`、`build_concat_args.py`(純粋関数) | メイン(Opus) | 最も重要な設計判断。FFmpeg のフィルターと許可リストを含む |
| 4 | `parse_progress.py`、`calculate_progress.py`(純粋関数) | Sonnet のサブエージェント | 仕様が確定している |
| 5 | `merge_job_store.py`、`run_merge_job.py`、`start_merge.py`、`router.py`、`schemas.py` | メイン(Opus) | 非同期・失敗の記録と再送出・後片付け・同時実行の制御 |
| 6 | 結合テスト(ピクセルの色・解像度・fps・音声・失敗時の片付け・ログ) | メイン(Opus) | tdd スキルに従い、ここでまとめて書くのではなく、タスク3・5の中で1件ずつ Red から進める |
| 7 | ダウンロード(`find_download.py`、`build_download_name.py`、`router.py`) | Sonnet のサブエージェント | ジョブの状態は参照せず、`disk_storage` のパスだけで判断する |
| 8 | レビュー | `design-reviewer`、`edge-case-reviewer`、`security-reviewer` を並列 | security-reviewer には差分を渡す |

- 各タスクは `tdd` スキルで行い、タスクごとにコミットする
- 4K の動画を使った重いテストは書かない(処理時間のため)。4K の判定はプラン1の単体テストと、小さい上限の設定で確かめる

## 7. コミット前テスト実行

```
docker compose run --rm --build backend pytest
docker compose run --rm --build frontend npx vitest run
docker compose run --rm --build e2e
docker compose --profile e2e down
```

3つともすべて通ることを確かめてからコミットする。結合テストの実行時間が長くなりすぎた場合(目安: 3分超)は、短い動画にするか共有の fixture にまとめる。

## 8. スコープ外

- 結合の画面(プラン3)
- ジョブの永続化(再起動で消える。Q1)と、実行中のジョブの中止
- 複数の結合の同時実行(Q4)
- GPU によるエンコード(Q3)
- HDR・10bit動画の色の変換(Q11)、非正方形画素の補正(Q17)
- 4K の実ファイルを使った性能の確認(手動で1回確かめる)

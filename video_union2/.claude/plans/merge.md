# プラン2: 結合とダウンロード(バックエンド)

目次と共通の決定事項: [video-merge.md](video-merge.md)
前提: プラン1([upload.md](upload.md))の共通基盤とメタ情報(`video_catalog.py`)が完成していること

## 1. 概要

アップロード済みの動画IDの並びを受け取り、結合ジョブを始める。ジョブは1本ずつ同じ形式の中間ファイルに揃え(1段目)、最後に再エンコードなしでつなぐ(2段目)。進み具合を問い合わせるAPIと、完了した結果のダウンロードAPIを作る。

対象の要件: FR-003〜007、FR-008(本数・結合後の長さ)、FR-009(サーバー側の確認)、FR-010〜012

## 2. 背景

- 4Kが混ざると再エンコードに数十分〜1時間以上かかりうるため、1リクエストで待たせずジョブにする(Q1)
- 100本を1つのFFmpegで同時に開くとメモリが足りなくなるおそれがあり、失敗した動画も特定しにくい。1本ずつ揃えてからつなぐ2段階にする(Q2)
- 出力の形式(解像度・fps・音声)を全体で1つに決めてから各動画を揃えるため、引数の組み立ては純粋関数に分け、FFmpegなしで単体テストする(architecture.md の副作用の分離)
- 利用者は1人なので、ジョブの状態はメモリに持ち、同時に実行できる結合は1件にする(Q1、Q4)

## 3. 詳細設計

### API

| メソッドとパス | 内容 | 成功 | 失敗 |
|---|---|---|---|
| `POST /api/merges` | 本文 `{ "video_ids": [str, ...] }`(並び順どおり) | 202 と `MergeJobResponse` | 422(本数・重複・長さ・存在しないID)、409(実行中の結合がある)、507(空き容量不足) |
| `GET /api/merges/{job_id}` | ジョブの状態 | 200 と `MergeJobResponse` | 404 |
| `GET /api/merges/{job_id}/download` | 結合結果のファイル。`Content-Disposition: attachment; filename="merged-YYYYMMDD-HHMMSS.mp4"`(完了時刻、Asia/Tokyo) | 200 | 404(存在しない・未完了・失敗・消された) |

`MergeJobResponse`: `{ "id": str, "status": "running" | "succeeded" | "failed", "progress": float(0〜1), "error": { "code", "message" } | null }`

- 失敗時の `message` の例: 「3番目の動画『IMG_0012.MOV』の変換に失敗しました」(Q16)
- 422 の `message` の例: 「結合後の長さが30分を2分15秒超えています」「結合するには2本以上の動画が必要です」「同じ動画が2回指定されています」

### 出力形式の決め方(純粋関数)

入力の `VideoInfo` の列から `OutputFormat` を決める。

- 幅 = 全動画の表示幅の最大値、高さ = 全動画の表示高さの最大値。奇数なら1足して偶数にする(FR-006、FR-010)
- fps = 全動画の fps の最大値。ただし `MAX_FPS`(60)を超えるなら `MAX_FPS`(FR-011)
  - fps は分数(例: 30000/1001)のまま扱い、最大値の比較も分数で行う
- 音声 = AAC、48kHz、ステレオ(FR-012)

### 1段目: 1本ずつ揃える(`build_normalize_args.py`)

各動画について次の引数を組み立てる(引数はリストで渡し、シェルを経由しない)。

- 入力: アップロード動画(`/data/uploads/{id}.bin`)。音声がない動画は、加えて `-f lavfi -i anullsrc=r=48000:cl=stereo`
- 映像のフィルター: `pad={W}:{H}:({W}-iw)/2:({H}-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p`
  - 回転は FFmpeg の自動回転に任せる(フィルターの前に適用される)。拡大はしない(FR-007)
- 音声のフィルター: `aresample=48000,aformat=channel_layouts=stereo,apad`。出力は `-shortest` で映像の長さに揃える(長い音声は切り、短い音声・無音は埋まる。Q13)
- 使うストリーム: 最初の映像(`0:v:0`)と最初の音声(`0:a:0`。ない場合は anullsrc)(Q12)
- エンコード: `-c:v libx264 -preset {X264_PRESET} -crf {X264_CRF} -pix_fmt yuv420p -c:a aac -b:a 192k -video_track_timescale 90000`
- 進み具合: `-progress pipe:1 -nostats` を付け、`out_time_us` を読む
- 出力: `/data/merges/{job_id}/parts/{連番4桁}.mp4`

### 2段目: つなぐ(`build_concat_args.py`、`build_concat_list.py`)

- concat demuxer の一覧ファイル `/data/merges/{job_id}/parts.txt` を作る。中身はサーバーが作った中間ファイルのパスだけ(利用者の入力を含まない)
- 引数: `-f concat -safe 0 -i parts.txt -c copy -movflags +faststart {出力}`(FR-010)
- 出力: `/data/merges/{job_id}/result.mp4`

### ジョブの流れ(`run_merge_job.py`)

1. 前回の結合結果を消す(Q6)
2. 1段目を1本ずつ実行し、進み具合を更新する
3. 2段目を実行する
4. 成功したら `succeeded`、どこかで失敗したら `failed` と、何番目のどのファイルかのメッセージ
5. 成功・失敗にかかわらず、`parts/` と `parts.txt` を消す
6. 失敗したときは、途中の `result.mp4` も消す

進み具合 = (完了した動画の長さの合計 + 変換中の動画の `out_time_us`) ÷ 全体の長さ × 0.95。2段目の完了で 1.0 にする(2段目は再エンコードしないため短い)。

### 結合前の確認(`validate_merge_request.py`、純粋関数)

`POST /api/merges` を受けたら、ジョブを始める前に次を確かめる。

- 本数が2本以上、`MAX_VIDEOS`(100)本以下(Q14、FR-008)
- 同じIDの重複がない(Q15)
- すべてのIDのメタ情報が存在する
- 長さの合計が `MAX_TOTAL_SECONDS`(1800)秒以下。1800.000秒ちょうどは許可(Q13)
- 実行中のジョブがない(409)
- 空き容量が見積もり以上ある(507)
  - 必要容量の見積もりは「入力ファイルの合計サイズ × 2」(中間ファイルと結果の分)。CRF では出力サイズが事前に分からないため、目安として扱う

### バックエンドのファイル

**結合 `backend/app/features/merge/`**

| ファイル | 担当(一文) |
|---|---|
| `router.py` | `POST /api/merges` と `GET /api/merges/{job_id}` を受け、処理を呼んで応答を返す |
| `schemas.py` | `MergeRequest` と `MergeJobResponse` を定義する |
| `validate_merge_request.py` | 本数・重複・存在・長さの合計を判定する純粋関数 |
| `plan_output_format.py` | `VideoInfo` の列から出力の幅・高さ・fps を決める純粋関数 |
| `build_normalize_args.py` | 1本の動画と出力形式から、1段目の FFmpeg の引数を組み立てる純粋関数 |
| `build_concat_list.py` | 中間ファイルのパスの列から、concat demuxer の一覧ファイルの中身を作る純粋関数 |
| `build_concat_args.py` | 2段目の FFmpeg の引数を組み立てる純粋関数 |
| `parse_progress.py` | FFmpeg の `-progress` の出力行から、変換済みの時間を取り出す純粋関数 |
| `calculate_progress.py` | 完了した長さ・変換中の時間・全体の長さから進み具合(0〜1)を計算する純粋関数 |
| `run_merge_job.py` | 1段目・2段目を順に実行し、状態の更新と中間ファイルの片付けを行う |
| `start_merge.py` | 確認 → 前回の結果の削除 → ジョブの登録と開始(`asyncio.create_task`)を行う |

**共通基盤の追加 `backend/app/lib/`**

| ファイル | 担当(一文) |
|---|---|
| `merge_job_store.py` | ジョブの状態をメモリに持ち、同時に1件だけ実行させる(merge と download から使う) |

**ダウンロード `backend/app/features/download/`**

| ファイル | 担当(一文) |
|---|---|
| `router.py` | `GET /api/merges/{job_id}/download` で、完了したジョブの結果を添付ファイルとして返す |
| `build_download_name.py` | 完了時刻から `merged-YYYYMMDD-HHMMSS.mp4` を作る純粋関数 |

ダウンロードはジョブの状態を読む必要がある。機能同士の import を避けるため、ジョブの状態は `backend/app/lib/merge_job_store.py` に置き、merge と download の両機能から使う。

**設定の追加(`lib/config.py`)**

| 環境変数 | 既定値 |
|---|---|
| `MAX_VIDEOS` | 100 |
| `MAX_TOTAL_SECONDS` | 1800 |
| `MAX_FPS` | 60 |
| `X264_PRESET` | `veryfast` |
| `X264_CRF` | 20 |

**保存先のレイアウトの追加**

```
/data/merges/{job_id}/parts/0001.mp4 ...   中間ファイル(ジョブの終了時に消す)
/data/merges/{job_id}/parts.txt            一覧ファイル(ジョブの終了時に消す)
/data/merges/{job_id}/result.mp4           結合結果(次の結合を始めるときに消す)
```

### ログ(logging.md)

- info: 1段目の各動画の変換完了(`video_ids`、`ms`)、結合完了(本数、出力の解像度、長さ、`ms`)
- error: FFmpeg の失敗(引数、終了コード、標準エラー出力の末尾。`run_process.py` が記録)

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| プラン1のアップロードの結合テスト | 影響なし。`conftest.py` の fixture を結合テストでも使う |
| `backend/tests/support/make_video.py` | 単色の動画を作るオプション(色の指定)を使う。足りなければ足す |
| フロントエンド・E2E | 影響なし(画面はプラン3) |

フレームの色を確かめる補助として `backend/tests/support/sample_pixel.py`(FFmpeg で指定時刻のフレームを取り出し、指定座標のRGBを返す)を足す。

## 5. 新規テストケース

### バックエンド単体(`backend/tests/unit/features/`)

**`merge/test_plan_output_format.py`**
- 1920x1080 と 1080x1920 から 1920x1920
- 1919x1079 だけなら 1920x1080(奇数の切り上げ)
- 30fps と 60fps なら 60fps。30000/1001 と 30 なら 30。120fps が混ざれば 60fps(上限)
- 1本だけ渡しても、その動画のサイズと fps になる

**`merge/test_build_normalize_args.py`**
- 640x360 を 1920x1080 に揃える引数に、`pad=1920:1080:(1920-iw)/2:(1080-ih)/2:color=black` と `scale` を含まない
- 音声ありの動画は `0:a:0` を使い、`anullsrc` を含まない
- 音声なしの動画は `anullsrc=r=48000:cl=stereo` の入力を足し、それを使う
- `-shortest`、`-pix_fmt yuv420p`、`-c:a aac`、設定した preset と crf を含む
- 引数はすべて文字列のリストで、入力パスが `-` で始まる値として解釈されない位置にある

**`merge/test_build_concat_list.py`**
- パスの列から `file '...'` の行を順番どおりに作る
- パスに `'` を含む場合はエスケープする(サーバーが作るパスには含まれないが、書式の破損を防ぐ)

**`merge/test_validate_merge_request.py`**
- 2本は許可、1本・0本は拒否
- 100本ちょうどは許可、101本は拒否(本当の上限値で確かめる)
- 合計 1800.000 秒は許可、1800.001 秒は拒否し、超過分を含むメッセージ
- 同じIDが2回あると拒否
- 存在しないIDがあると拒否

**`merge/test_parse_progress.py` と `test_calculate_progress.py`**
- `out_time_us=1500000` の行から 1.5 秒を取り出す。関係ない行・`N/A` は無視する
- 全体 10 秒のうち完了 4 秒・変換中 1 秒なら 0.475(×0.95)。2段目の完了で 1.0
- 0 を下回らず、1 を超えない

**`download/test_build_download_name.py`**
- 2026-10-07 09:05:03(Asia/Tokyo)から `merged-20261007-090503.mp4`

### バックエンド結合(`backend/tests/integration/features/`。本物の FFmpeg を使う)

**`merge/test_merge_api.py`**
- 赤(1秒・640x360)・緑(1秒・640x360)・青(1秒・640x360)を赤緑青の順で結合すると、出力の0.5秒・1.5秒・2.5秒のフレームの中央がそれぞれ赤・緑・青になる。順番を青赤緑に変えると、その順になる
- 赤 640x360 と 緑 360x640 を結合すると出力は 640x640 になり、0.5秒のフレームの (320,320) が赤、(320,10) が黒(上の縁)
- 回転情報 90 付きの 640x360 と 640x360 を結合すると、出力は 640x640 になる
- 30fps と 60fps の動画を結合すると、出力は 60fps(ffprobe の `avg_frame_rate`)
- 音声なしの動画と音声ありの動画を結合すると、出力に音声トラックが1つあり、48kHz・2ch
- 全動画が音声なしでも、出力に音声トラックがある
- 出力は H.264・yuv420p・AAC で、`moov` がファイルの先頭側にある(faststart)
- 出力の長さが入力の合計と ±1フレーム以内で一致する
- 小さい上限の設定(`MAX_TOTAL_SECONDS=2`)で、1秒+1秒は202、1秒+1.5秒は422
- 1本だけ・重複ID・存在しないIDは422
- 実行中にもう1件頼むと409
- 途中の1本が壊れている(先頭は正しく、途中を切り詰めたファイル)と `failed` になり、何番目のどのファイルかのメッセージを返し、`parts/` と `result.mp4` が残らない
- 成功後に次の結合を始めると、前回の `result.mp4` が消える
- 成功・失敗のどちらでも `parts/` と `parts.txt` が残らない

**`download/test_download_api.py`**
- 完了したジョブの結果を200で返し、`Content-Disposition` のファイル名が `merged-` で始まり `.mp4` で終わる。中身が `result.mp4` と一致する
- 存在しないジョブID・形式が不正なID・実行中・失敗したジョブは404
- ジョブIDに `../uploads/{video_id}` を入れても、アップロード動画を取得できない

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 1 | `sample_pixel.py` と `make_video.py` への色指定の追加 | Haiku のサブエージェント | 定型作業。単色動画のピクセルを読むテストを付ける |
| 2 | `plan_output_format.py`、`validate_merge_request.py`(純粋関数)と設定の追加 | メイン(Opus) | fps の分数の扱いを含む |
| 3 | `build_normalize_args.py`、`build_concat_list.py`、`build_concat_args.py`(純粋関数) | メイン(Opus) | 最も重要な設計判断。FFmpeg のフィルターを含む |
| 4 | `parse_progress.py`、`calculate_progress.py`(純粋関数) | Sonnet のサブエージェント | 仕様が確定している |
| 5 | `lib/merge_job_store.py`、`run_merge_job.py`、`start_merge.py`、`router.py`、`schemas.py` | メイン(Opus) | 非同期・失敗時の片付け・同時実行の制御 |
| 6 | 結合テスト(ピクセルの色・解像度・fps・音声・失敗時の片付け) | メイン(Opus) | タスク3・5の Red を先に書く。tdd スキルに従い、ここでまとめて書くのではなく各タスクの中で1件ずつ進める |
| 7 | ダウンロード(`build_download_name.py`、`router.py`) | Sonnet のサブエージェント | ジョブの状態は `lib/merge_job_store.py` から読む |
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

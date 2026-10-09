# プラン1: テキストの場面の作成と結合(バックエンド)

目次: [text-merge.md](text-merge.md) / 元資料: `docs/requirements/text-merge.md`

## 1. 概要

結合の依頼に「テキストの場面」(テキストと0.1秒単位の表示時間)を並べられるようにし、黒背景に白文字の映像として、指定の位置で動画とつなぐ。

- 結合 API の本文を `video_ids` から `items`(動画とテキストの場面の列)に変える
- テキストを正規化して検証し(行数、1行の文字数、全体の文字数、制御文字、フォントにない文字、表示時間)、だめなら 422 と理由を返す
- Pillow で出力サイズの PNG に文字を描き、1段目で動画と同じ形式の中間ファイルにする。2段目(再エンコードなしの結合)は変えない
- 日本語フォント(IPAexゴシック)を backend のイメージに入れる

このプランが終わった時点では、テキストの場面は API からだけ使える。画面はプラン2で作る。ただし、画面の結合の依頼(`requestMerge.ts`)は、このプランで `items` の形に直す(動画だけの結合が動き続けるようにするため)。

## 2. 背景

- 撮りためた動画をつなぐと、どこからが別の日・別の場所の動画かがわからない。見出しを挟みたい(要件のストーリー1)
- 今の結合は、1段目で1本ずつ出力の解像度・fps・音声に揃えた中間ファイルを作り、2段目で `-c copy` でつなぐ(`run_merge_job.py`)。テキストの場面も1段目で同じ形式の中間ファイルにすれば、2段目と出力形式の決め方(`plan_output_format.py`)はそのまま使える
- 利用者の文字を FFmpeg の `drawtext` に渡すと、`%{...}` の展開やフィルター文字列の区切り(`:` `'` `,`)の扱いを誤ったときに意図しない処理につながる。Pillow で画像にしてから渡せば、FFmpeg に届くのは画像ファイルのパスだけになる(Q3)
- 今の backend のイメージ(`python:3.12-slim`)には日本語フォントがない(Q4)

## 3. 詳細設計

### API

`POST /api/merges`(202。応答は今と同じ `MergeJobResponse`)

```json
{
  "items": [
    {"type": "text", "text": "2026年10月9日\n京都", "duration_tenths": 30},
    {"type": "video", "video_id": "0123...(32桁)"},
    {"type": "text", "text": "嵐山", "duration_tenths": 55},
    {"type": "video", "video_id": "4567..."}
  ]
}
```

- `items` は `type` で見分ける(pydantic の判別付きの共用体)。`video_ids` は受け付けない(利用者は画面だけのため、互換は持たない。Q8)
- `duration_tenths` は `StrictInt`。`5.5` や `"55"` は形の誤りとして `invalid_request`(422)になる
- `text` は `str`。長さと中身の検証は、日本語の理由を返すため、pydantic ではなく `normalize_scene_text` で行う
- 本文は1MBまで(Q9)。ルーターで本文を読みながらバイト数を数え、超えたら読むのをやめて 413 `request_too_large`「結合の依頼が大きすぎます」を返す。読み終えてから `MergeRequest.model_validate_json` で形を確かめる

**エラー(すべて 422、message は画面にそのまま出す)**

| code | 条件 | message の例 |
|---|---|---|
| `no_video` | 動画が0本 | 結合するには動画が1本以上必要です |
| `too_few_items` | 動画とテキストの場面が合わせて1つ以下 | 結合するには動画とテキストの場面を合わせて2つ以上必要です |
| `too_many_videos` | 動画が上限を超える(テキストの場面は数えない) | 一度に結合できるのは100本までです |
| `duplicate_video` | 同じ動画が2回 | 同じ動画が2回指定されています |
| `invalid_text_scene` | テキストの検証に失敗 | 2番目のテキストの場面: 1行は20文字までです(3行目が23文字) |
| `unsupported_characters` | フォントにない文字・改行以外の制御文字 | 2番目のテキストの場面: 表示できない文字が含まれています: 😀 タブ |
| `too_long` | 合計が30分を超える | 結合後の長さが30分を1秒超えています(今と同じ) |
| `output_too_small_for_text` | テキストの場面があり、出力の短い辺が23ピクセル未満(B-9) | 動画の解像度が小さすぎて、テキストの場面を表示できません(出力の短い辺が23ピクセル以上必要です) |

- 番号は「何番目のテキストの場面か」ではなく「リスト全体での位置」で数える(Q11)。画面の行の番号と一致させるため
- 原因の文字は重複を除いて最初の5つまで並べる。制御文字は名前で示す(タブ、復帰など。それ以外は `U+0007` の形)
- 確認の順番: 本文の大きさ → 形 → 本数・重複・表示時間(`validate_merge_items`) → テキストの場面の正規化(`normalize_text_items`。リストの前から順に、最初の失敗を返す) → 動画のメタ情報の読み出し → 合計の長さ・テキストの場面を描ける出力サイズか・空き容量(`validate_merge_request`)。メタ情報を読む前に、安く確かめられるものを先に確かめる(video-merge の I17 と同じ考え方)

### テキストの正規化と検証(`normalize_scene_text.py`、純粋関数)

入力: 生のテキストと、フォントにある文字の集合(`frozenset[int]`)。出力: 行のタプル、または失敗の理由。

1. `\r\n` を `\n` にそろえる
2. NFC で正規化する(Q7)
3. 改行以外の制御文字(Unicode の分類 `Cc`)と書式文字(`Cf`。幅のない空白、U+FEFF、文字の向きを変える文字)があれば `unsupported_characters`。**取り除く処理より前に確かめる**ので、先頭・末尾のタブも拒否される(B-1、FR-004a)
4. 前後の「半角空白(U+0020)・全角空白(U+3000)・改行」だけを取り除く。`str.strip()` は使わない(タブや U+001C〜001F、U+0085 まで取り除き、画面の `trim()` と取り除く文字が食い違うため。B-1)。これで先頭・末尾の空行も消える
5. 空なら「テキストを入力してください」
6. フォントにない文字(空白類を除く)があれば `unsupported_characters`(Q5)
7. 行に分ける。6行以上なら「5行までです(6行あります)」
8. 1行が21文字以上なら「1行は20文字までです(3行目が23文字)」
9. 改行を除いて101文字以上なら「全体で100文字までです(101文字あります)」(1行20文字・5行の上限の下では起きないが、要件の上限として確かめる)
10. 各行の行末の空白は取り除かない(利用者の入力どおりに描く)

文字数は NFC のあとのコードポイント数で数える(Python の `len`)。画面(プラン2)も `[...text.normalize("NFC")].length` で同じ数え方にする。取り除く文字の集合と、拒否する分類(`Cc` のうち改行以外、`Cf`)も、画面と同じにする(B-1)。

### テキストの場面の列の検証(`normalize_text_items.py`、純粋関数。D-1)

入力: `items` とフォントにある文字の集合。出力: 「リストでの位置 → `TextScene`」の対応、または失敗(code と、番号付きの message)。

- `items` を前から順に見て、テキストの場面ごとに `normalize_scene_text` を呼び、最初の失敗で止める
- message の頭に「{リスト全体での位置}番目のテキストの場面: 」を付ける(Q11)。番号の数え方をこの関数の単体テストで確かめる
- `start_merge` はこの関数を呼ぶだけにする(判断と変換を、前回の結果の削除やジョブの開始と同じファイルに書かない)

### 入力の列の組み立て(`build_merge_segments.py`、純粋関数。D-1)

入力: `items`、テキストの場面の対応、読み出した動画の `MergeSource` の列。出力: リストの順の `MergeSegment` の列。

### 表示時間(`validate_merge_items.py` の中)

- `duration_tenths` が10未満、または600を超えたら `invalid_text_scene`「{n}番目のテキストの場面: 表示時間は1秒から60秒までで、小数第1位まで指定してください」(画面と同じ文言。B-8)
- 合計の長さは、動画は今と同じくミリ秒に丸めて足し、テキストの場面は `duration_tenths * 100` ミリ秒を足す(`validate_merge_request` の計算を拡張する。画面の `sumMergeItemsMilliseconds` と同じ値になる)
- 超過の時間の文言は今の `format_excess`(秒に切り上げ)のまま。画面も同じ `formatExcess` で出すので、1790秒 + 10.1秒なら画面もサーバーも「…30分を1秒超えています」になる(B-8)

### テキストの場面を描ける出力サイズか(`validate_merge_request.py` の中。B-9)

- テキストの場面が1つ以上あり、`plan_output_format` で決まる出力の短い辺が23ピクセル未満(フォントの大きさが1未満になる)なら、ジョブを作らずに 422 `output_too_small_for_text` を返す
- 202 を返したあとにジョブの中で失敗させない(利用者に理由が伝わらないため)
- 要件定義の既知の制限に、この条件を書き足した

### 文字の配置(`layout_text_scene.py`、純粋関数)

入力: 出力の幅・高さ、行の数、各行の幅(描画側が測ったピクセル数)。出力: フォントの大きさと、各行の中心の座標。

- フォントの大きさ: `floor(短い辺 × 0.045)`。全角20文字(1文字 = 1em)で短い辺の90%になる。テキストの長さでは変えない(Q1)
  - 1080x1920 なら 48px、1920x1080 なら 48px、640x360 なら 16px
- 行の高さ: フォントの大きさの1.5倍。5行で 7.5em(短い辺の約34%)に収まる
- 縦: 行のかたまり全体を、出力の上下の中央に置く。横: 行ごとに左右の中央に置く
- 余白: どの行の幅も「出力の幅 − 左右の5%ずつ」を超えたら `ValueError`(IPAexゴシックでは全角が最も広く、20文字で90%ちょうどになるため、本来は起きない。起きたら描かずに失敗にする)
- フォントの大きさが1未満になる場合(短い辺が22ピクセル以下)も `ValueError`。受け付ける前に `output_too_small_for_text` で拒否するので、ここは念のための守り
- `ValueError` のメッセージには、行番号・ピクセル数・出力の幅と高さだけを入れ、行の中身を入れない(ログの `err` に載るため。S-1/O-3)

### 文字の描画(`render_text_scene.py`)

- Pillow で出力の幅・高さの RGB の黒い画像を作り、`layout_text_scene` の結果に従って白(255,255,255)で各行を描き、PNG で保存する
- 各行の幅は `ImageFont.getlength` で測る。描くときは `anchor="mm"`(行の中心を基準)を使う
- 保存先は `disk_storage.merge_text_image_path(job_id, index)`(`parts/0003.png`)
- CPU を使う処理なので、ジョブの中では `asyncio.to_thread` で呼ぶ

### フォント(`load_scene_font.py`)

- 設定 `scene_font_path`(環境変数 `SCENE_FONT_PATH`、既定は IPAexゴシックのパス。実際のパスは導入時に `dpkg -L fonts-ipaexfont-gothic` で確かめて既定値にする)
- 起動時(`main.py` の lifespan)にフォントを読み、fontTools でフォントにある文字の集合(cmap)を作って `app.state.scene_font` に持つ。ファイルがない・読めないときは起動を失敗させる(testing.md「足りなければ失敗させる」)
- 読み込みに失敗したら、logger.py 経由で error を記録してから再送出し、起動を止める(O-1。logging.md 規則2・3)。記録するのは `name="merge.load_scene_font"`、`err`、`setting="SCENE_FONT_PATH"`。パスの値は記録しない(環境変数の値を出さないため)。成功は記録しない(1秒を超えたときだけ info と `ms`)
- merge だけが使うため、`lib/` ではなく `features/merge/` に置く(architecture.md の問い1)

### 1段目: テキストの場面の中間ファイル(`build_text_scene_args.py`、純粋関数)

```
ffmpeg -y -nostdin -v error -xerror
  -protocol_whitelist file -format_whitelist image2 -f image2 -loop 1 -framerate {fps} -i parts/0003.png
  -f lavfi -i anullsrc=r=48000:cl=stereo
  -filter_complex "[0:v]setsar=1,fps={fps},format=yuv420p[v]"
  -map [v] -map 1:a
  -frames:v {フレーム数} -t {フレーム数 ÷ fps(小数6桁)}
  -c:v libx264 -preset {preset} -crf {crf} -pix_fmt yuv420p
  -c:a aac -b:a 192k -ar 48000 -ac 2
  -video_track_timescale 90000
  -progress pipe:1 -nostats
  parts/0003.mp4
```

- 映像・音声のエンコーダーと設定は `build_normalize_args` と同じにする(2段目の `-c copy` でつなぐため)。共通の部分(エンコーダーの引数)は、merge の中の1つの関数にまとめて両方から使う
- フレーム数 = `round(duration_tenths / 10 × fps)`(0.5は切り上げ。最小1)。例: 5.5秒・30000/1001 fps → 164.835 → 165フレーム(Q17)
- 入力は アプリが作った PNG だけなので、形式の許可は `image2` だけにする。利用者の文字は引数に入らない
- 進み具合と時間の上限は、動画と同じく `parse_progress`・`calculate_progress` と `ffmpeg_timeout_per_second` を使う(テキストの場面の長さはフレーム数から計算した秒数)

### 結合の入力の型(`merge_segment.py`)

```python
@dataclass(frozen=True)
class TextScene:
    """結合の入力になるテキストの場面。lines は正規化済みの行。"""
    lines: tuple[str, ...]
    duration_tenths: int

MergeSegment = MergeSource | TextScene
```

### ジョブの流れの変更(`start_merge.py`、`run_merge_job.py`)

- `start_merge` は `items` を受け取り、上の順に確認の関数を呼び、`build_merge_segments` でリストの順の `MergeSegment` の列を作る。自分では判断や変換をしない(D-1)
- `plan_output_format` には動画(`MergeSource`)だけを渡す。テキストの場面は出力の大きさと fps を決める計算に入れない(FR-009)
- `run_merge_job` は `MergeSegment` の列を前から順に処理する。動画は今と同じ。テキストの場面は「PNG を描く → `build_text_scene_args` で中間ファイルを作る」。PNG は `parts/` の中に置くので、成功・失敗のどちらでも今の後片付け(`parts/` ごと消す)で消える
- 失敗したら、テキストの場面なら「{n}番目のテキストの場面の作成に失敗しました」(Q11)。動画は今の文言のまま。番号はどちらもリスト全体での位置
- 空き容量の見積もり(入力の合計サイズ × 2)には、テキストの場面を足さない(静止画で、1秒あたりの大きさが動画より十分小さいため)
- `MergeJob.video_ids` はそのまま(動画のIDだけを入れる。ログで使う)

### ログ(Q10)

- テキストの本文はログに出さない。結合の開始・完了・失敗のログに `text_scene_count` を足す
- テキストの場面の作成の失敗(error)には、次を必ず出す(O-2)
  - `err`(例外の型・メッセージ・スタックトレース)
  - `failed_index`(リスト全体での位置)、`failed_kind="text"`
  - `failed_step`: `"layout"`(配置の `ValueError`)、`"render"`(Pillow の描画・PNG の書き込み)、`"encode"`(FFmpeg)のどれか
  - 出力の `width`・`height`、`line_count`、`char_count`
- `run_process` は失敗時に引数を記録するが、テキストの場面の引数に入るのは PNG のパスだけなので、本文は漏れない
- **ジョブを作らずに返す経路(413・422)でも、本文を記録しない**(S-1/O-3)
  - 413・422(`invalid_request`・`invalid_text_scene`・`unsupported_characters`・`output_too_small_for_text` を含む)は記録しない(今の `errors.py` の扱いどおり)
  - pydantic の `ValidationError` の中身(入力値を含む)と、原因の文字を含む message を、ログに渡さない

### バックエンドのファイル

| ファイル | 担当(一文) | 変更 |
|---|---|---|
| `app/features/merge/schemas.py` | 結合の依頼と応答の形を定める | `MergeRequest.items` と `VideoItem`・`TextItem` を足し、`video_ids` を消す |
| `app/features/merge/router.py` | 結合の API を受け、処理の関数を呼ぶ | 本文の大きさの上限の確認を足す |
| `app/features/merge/read_limited_body.py` | 本文を上限まで読み、超えたら 413 にする | 新規 |
| `app/features/merge/merge_segment.py` | 結合の入力(動画またはテキストの場面)の型を定める | 新規 |
| `app/features/merge/validate_merge_items.py` | メタ情報を読む前に、本数・重複・表示時間を確かめる | 新規(`validate_merge_request.validate_video_ids` を移して拡張する) |
| `app/features/merge/normalize_scene_text.py` | テキストを正規化し、行に分けて検証する | 新規 |
| `app/features/merge/normalize_text_items.py` | `items` のテキストの場面を前から順に正規化し、位置と `TextScene` の対応か、番号付きの失敗を返す | 新規(D-1) |
| `app/features/merge/build_merge_segments.py` | `items` の並びに沿って、動画の `MergeSource` とテキストの場面から `MergeSegment` の列を作る | 新規(D-1) |
| `app/features/merge/validate_merge_request.py` | メタ情報を読んだあとに、合計の長さ・テキストの場面を描ける出力サイズか・空き容量を確かめる | テキストの場面の長さを合計に足し、出力サイズの確認を足す(B-9) |
| `app/features/merge/layout_text_scene.py` | 出力サイズと行の幅から、文字の大きさと行の位置を決める | 新規 |
| `app/features/merge/render_text_scene.py` | テキストの場面を PNG に描く | 新規 |
| `app/features/merge/load_scene_font.py` | フォントを読み、フォントにある文字の集合を作る | 新規 |
| `app/features/merge/build_encode_args.py` | 中間ファイルのエンコーダーの引数(映像・音声)を返す | 新規(`build_normalize_args` から切り出す) |
| `app/features/merge/build_text_scene_args.py` | PNG からテキストの場面の中間ファイルを作る FFmpeg の引数を組み立てる | 新規 |
| `app/features/merge/build_normalize_args.py` | 1本の動画を出力の形式に揃える引数を組み立てる | エンコーダーの引数を `build_encode_args` から取る |
| `app/features/merge/start_merge.py` | 確認 → 前回の結果の削除 → ジョブの開始 | `items` を受け取り、確認の関数と `build_merge_segments` を呼ぶ |
| `app/features/merge/run_merge_job.py` | 中間ファイルを順に作ってつなぎ、状態を更新する | テキストの場面の分岐と失敗の文言 |
| `app/lib/disk_storage.py` | 保存先のパスを種類ごとに返す | `merge_text_image_path` を足す |
| `app/lib/config.py` | 設定を環境変数から読む | `scene_font_path` を足す |
| `app/main.py` | アプリを組み立てる | lifespan でフォントを読む |
| `Dockerfile` | backend のイメージ | `fonts-ipaexfont-gothic` を入れる |
| `pyproject.toml` | 依存 | `pillow`、`fonttools` を固定の版で足す(導入時点の最新の安定版) |
| `frontend/src/features/merge/requestMerge.ts` | 結合を依頼する(API の本文の形への変換もここだけで行う) | 引数(動画の ID の列)はそのままで、中で `items`(動画だけ)の形にする。プラン2で引数を `MergeItem[]` に広げ、変換を `toMergeRequestItems` に分けるが、呼ぶのは引き続き `requestMerge` だけ(D-2) |

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| `backend/tests/integration/features/merge/test_merge_api.py` | 本文を `{"items": [{"type":"video", ...}]}` に変える(`_merge` の補助関数だけを直す)。期待値は変えない。`too_few_videos` を確かめているテストは、新しい `too_few_items`・`no_video` に置き換える |
| `backend/tests/integration/features/download/test_download_api.py` | 結合の依頼の本文を同様に直す |
| `backend/tests/unit/features/merge/test_validate_merge_request.py` | 本数・重複のテストを `test_validate_merge_items.py` に移す。長さ・空き容量のテストはテキストの場面を含む入力に広げる |
| `backend/tests/unit/features/merge/test_build_normalize_args.py` | 期待値は変えない(エンコーダーの引数の切り出しで振る舞いが変わらないことを確かめる) |
| `backend/tests/unit/lib/test_config.py` | 既定値の一覧に `scene_font_path` を足す |
| `backend/tests/unit/lib/test_disk_storage.py` | `merge_text_image_path` を足す |
| `frontend/tests/unit/features/merge/requestMerge.test.ts` | 送る本文の期待値を `items` に変える |
| E2E | 期待値は変えない。動画だけの結合が今までどおり通ることを確かめる |

テストの補助として `backend/tests/support/bright_bbox.py`(指定時刻のフレームで、明るさがしきい値(128)を超える画素の外接矩形を返す。なければ None)を足す。

## 5. 新規テストケース

### バックエンド単体(`backend/tests/unit/features/merge/`)

**`test_normalize_scene_text.py`**(フォントの文字の集合は、テストの中で小さな集合を作って渡す)
- 「京都」→ `("京都",)`。「2026年10月9日\n京都 嵐山」→ 2行
- `"京都\r\n嵐山"` → `("京都", "嵐山")`
- 前後の空白・全角空白・先頭と末尾の空行を取り除く: `"\n　京都 \n\n"` → `("京都",)`
- 途中の空行は残す: `"京都\n\n嵐山"` → `("京都", "", "嵐山")`
- 行末の空白は、最後の行以外は残す: `"京都 \n嵐山"` → `("京都 ", "嵐山")`
- NFD の「か + 濁点」(U+304B U+3099)は NFC の「が」1文字になり、20文字の境界で1文字と数える
- 空・空白だけ・改行だけ → 「テキストを入力してください」
- 5行は許可、6行は「5行までです(6行あります)」
- 1行20文字は許可、21文字は「1行は20文字までです(1行目が21文字)」。どの行が超えたかを示す
- 「𠮷」(サロゲートペアになる文字)を20個並べた行は許可(1文字と数える)
- 5行 × 20文字(改行を除いて100文字)は許可
- タブ・U+0007・幅のない空白(U+200B)・文字の向きを変える文字(U+202E)を含むと `unsupported_characters` で、文字の名前(タブ)または `U+0007` の形で示す
- 先頭・末尾のタブ(`"\t京都"`、`"京都\t"`)も `unsupported_characters`(取り除かれて受け付けられない。B-1)
- 先頭の U+FEFF、末尾の U+0085 も `unsupported_characters`(画面と同じ判定になる。B-1)
- フォントの集合にない文字(😀)を含むと `unsupported_characters` で「😀」を示す。同じ文字が何度あっても1回だけ示し、最大5つまで示す
- 空白(半角・全角)はフォントの集合になくても拒否しない

**`test_normalize_text_items.py`**(D-1)
- [動画, テキスト(21文字の行), テキスト(😀)] → 最初の失敗だけを返し、message が「2番目のテキストの場面: 1行は20文字までです(1行目が21文字)」
- [テキスト, 動画, テキスト] がすべて正しい → 位置0と2の `TextScene` を返す
- テキストの場面がない → 空の対応

**`test_build_merge_segments.py`**(D-1)
- [テキスト, 動画A, テキスト, 動画B] と対応・`MergeSource` から、同じ順の `MergeSegment` の列を作る

**`test_validate_merge_items.py`**
- 動画2本 → 許可。動画1本 + テキストの場面1つ → 許可。テキストの場面 → 動画 → テキストの場面 → 許可
- 動画1本だけ → `too_few_items`。空のリスト → `no_video`。テキストの場面2つだけ → `no_video`
- 動画100本 + テキストの場面5つ → 許可。動画101本 → `too_many_videos`(本当の上限値で確かめる)
- 同じ動画が2回 → `duplicate_video`。同じ文言のテキストの場面が2つ → 許可
- 表示時間 10 と 600 は許可、9 と 601 は `invalid_text_scene`「…表示時間は1秒から60秒までで、小数第1位まで指定してください」(画面と同じ文言。B-8)。番号はリスト全体での位置(動画 → テキストの場面なら「2番目」)

**`test_validate_merge_request.py`**(既存に追加)
- 動画 1790.000 秒 + テキストの場面 100(10.0秒)= 1800.000 秒は許可、テキストの場面が 101 なら `too_long` と「…30分を1秒超えています」
- 動画 [600.1, 600.2] + テキストの場面 5997(599.7秒)は許可(ミリ秒に丸めた合計で比べる)
- 動画 1790.000 秒 + テキストの場面 101(10.1秒)の message は「結合後の長さが30分を1秒超えています」(画面と同じ。B-8)
- テキストの場面があり出力が 22x22 → `output_too_small_for_text`。24x24 → 許可。テキストの場面がなければ 22x22 でも許可(B-9)

**`test_layout_text_scene.py`**
- 1920x1080・1080x1920 → フォントの大きさ 48、640x360 → 16
- 1行なら、その行の中心が出力の中心。5行なら、3行目の中心が出力の中心で、行の間隔がフォントの大きさの1.5倍
- 行の幅が「出力の幅 × 0.9」ちょうどなら許可、1ピクセル超えると `ValueError`
- 短い辺 23 → フォントの大きさ 1 で許可、16x16 → `ValueError`(フォントの大きさが1未満)

**`test_build_text_scene_args.py`**
- `-protocol_whitelist file -format_whitelist image2 -f image2 -loop 1` が入力の PNG の直前にある
- 5.5秒(55)・30fps → `-frames:v 165`、`-t 5.500000`。5.5秒・30000/1001 fps → `-frames:v 165`、`-t 5.505500`。1.0秒・24fps → 24
- 映像のフィルターが `setsar=1`、`fps={num}/{den}`、`format=yuv420p` を含み、音声は `anullsrc=r=48000:cl=stereo`
- エンコーダーの引数(`-c:v libx264`、preset、crf、`-pix_fmt yuv420p`、`-c:a aac`、`-ar 48000`、`-ac 2`、`-video_track_timescale 90000`)が `build_normalize_args` と同じ並びで入る
- 引数に PNG と出力のパス以外のファイルパスが入らない(テキストの本文が引数のどこにも入らないことを、本文を入れた `TextScene` から作った引数で確かめる)

**`test_build_normalize_args.py`**(既存のまま通る)

**`backend/tests/unit/lib/test_disk_storage.py`**(既存に追加)
- `merge_text_image_path(job_id, 3)` が `merges/{job_id}/parts/0003.png`。形式が不正な job_id は `InvalidIdError`

**`backend/tests/unit/lib/test_config.py`**(既存に追加)
- `SCENE_FONT_PATH` を読む。指定がなければ IPAexゴシックの既定のパス

### バックエンド結合(`backend/tests/integration/features/merge/`。本物の FFmpeg・Pillow・フォント)

**`test_render_text_scene.py`**
- 640x360 に「■」を描くと、中心(320,180)が白、四隅が黒
- 1080x1920 と 1920x1080 に、「■」20文字 × 5行を描くと、白い画素の外接矩形が、左右・上下とも出力の端から5%より内側にある(SC-004)
- 「あいう漢字ABC」を描くと白い画素がある(日本語の字形がある)。同じフォントで、フォントにない文字だけを描いた画像とは画素が異なる
- 同じテキストを2回描くと、同じ画像になる

**`test_load_scene_font.py`**
- 既定のフォントを読むと、「あ」「漢」「■」「A」のコードポイントが集合にあり、「😀」がない
- 存在しないパスを指定してアプリを起動すると、起動が失敗し、error のログに `name="merge.load_scene_font"`・`err`・`setting="SCENE_FONT_PATH"` があり、パスの値がない(O-1)
- フォントでないファイル(テキストファイル)を指定しても、同じく記録してから起動が失敗する

**`test_merge_api.py`**(既存に追加)
- 赤(1秒)・テキストの場面「■」(1.0秒)・青(1秒)を結合すると、0.5秒の中央が赤、1.5秒の中央が白・四隅が黒、2.5秒の中央が青。出力の長さは3秒 ± (1フレーム + 0.03秒)(SC-001・SC-002)
- テキストの場面(5.5秒)だけの区間の長さ: 30000/1001 fps の動画と結合すると、出力の長さ − 動画の長さが 165フレーム分(5.5055秒)± (1フレーム + 0.03秒)で、5.5秒との差が0.1秒以内(SC-003)
- 動画1本の前後にテキストの場面を1つずつ置くと結合でき、0.5秒・中央・最後の区間がそれぞれ白・動画の色・白(SC-007)
- 1920x1080 と 1080x1920 の動画にテキストの場面(「■」20文字 × 5行)を挟むと、出力は 1920x1920 で、テキストの場面のフレームの白い画素の外接矩形が出力の端から5%より内側(SC-004)
- テキストの場面の区間が無音(`max_volume_db` が -80dB 未満)で、出力の音声トラックは1つ・48kHz・2ch
- テキストの場面の区間の fps と解像度が出力と同じで、`decodes_to_end` がエラーなく終わる(2段目の `-c copy` でつながっている)
- 小さい上限(`MAX_TOTAL_SECONDS=3`)で、動画1秒 + テキストの場面2.0秒は202、2.1秒は422 `too_long`
- `MAX_VIDEOS=2` で、動画2本 + テキストの場面3つは202(テキストの場面を本数に数えない。SC-009)
- テキストの場面だけ2つは422 `no_video`、動画1本だけは422 `too_few_items`
- 21文字の行・6行・空・タブ入り・😀入りのテキストは、それぞれ 422 と `invalid_text_scene`・`unsupported_characters`、message に位置と原因が入る(SC-005・SC-005a)。どの場合もジョブは作られない(続けて正しい依頼を送ると202)
- `duration_tenths` に `5.5`・`"55"` を入れると 422 `invalid_request`。9 と 601 は 422 `invalid_text_scene`
- 本文が1MBを超えると413 `request_too_large`
- `"video_ids"` だけの古い形の本文は 422 `invalid_request`
- テキストの本文に `'`、`:`、`%{pts}`、`\`、`;` を含めても、結合が成功し、`parts/` の外にファイルができない
- 22x22 の動画とテキストの場面を結合すると、ジョブを作らずに 422 `output_too_small_for_text`。24x24 なら成功する(B-9)
- テキストの場面の作成が失敗した場合は `failed` になり、「1番目のテキストの場面の作成に失敗しました」を返し、`parts/`(PNG を含む)・`parts.txt`・`result.partial.mp4` が残らない。失敗は、存在しない preset の設定(`X264_PRESET=invalid`)で [テキストの場面, 動画] を結合して起こす(モックではなく設定で起こす)。error のログに `failed_kind="text"`・`failed_step="encode"`・`failed_index=1`・`err`・`width`・`height` がある(O-2)
- 結合の開始・完了・失敗のログに `text_scene_count` があり、テキストの本文(テストで使った固有の文字列)がログのどこにも出ない
- 422 で返す経路(😀入り・タブ入り・21文字の行・`type` を誤った項目・`duration_tenths="55"`)と413 のそれぞれのあとで、テキストの本文の固有の文字列がログのどこにも出ない(S-1/O-3)

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 1 | `Dockerfile` へのフォントの導入、`pyproject.toml` への `pillow`・`fonttools` の追加、`config.py` の `scene_font_path`、`disk_storage.merge_text_image_path`、補助関数 `tests/support/bright_bbox.py` | Haiku のサブエージェント | 定型作業。フォントの実際のパスを `dpkg -L` で確かめて既定値にする。`bright_bbox` には単色・白い四角の動画で確かめるテストを付ける |
| 2 | `normalize_scene_text.py` | Sonnet のサブエージェント | 正規化の手順と境界値がこのプランで確定している |
| 3 | `merge_segment.py`、`schemas.py`、`validate_merge_items.py`、`normalize_text_items.py`、`build_merge_segments.py`、`validate_merge_request.py` の拡張(出力サイズの確認を含む) | メイン(Opus) | API の形と確認の順番を決める |
| 4 | `load_scene_font.py`(失敗の記録を含む)、`layout_text_scene.py`、`render_text_scene.py` と `main.py` の lifespan | メイン(Opus) | 文字の大きさと配置、フォントの扱い。描画の結合テストを含む |
| 5 | `build_encode_args.py` の切り出し、`build_text_scene_args.py` | メイン(Opus) | 2段目の `-c copy` でつながる形式にそろえる。フレーム数の丸め |
| 6 | `read_limited_body.py`、`router.py`、`start_merge.py`、`run_merge_job.py`、ログ | メイン(Opus) | 失敗の文言・後片付け・`failed_step` の記録・本文を記録しないこと(413・422 の経路を含む) |
| 7 | 既存テストの本文の書き換え(`test_merge_api.py`、`test_download_api.py`)と `requestMerge.ts`・`requestMerge.test.ts` | Sonnet のサブエージェント | 期待値は変えずに本文の形だけを直す。タスク3の直後に行い、既存のテストを壊したままにしない |
| 8 | 手動確認: 実際の縦長・横長の動画にテキストの場面を挟み、文字が読めること、つなぎ目で音が途切れたり映像が乱れたりしないことを見る | ユーザー | review.md「静的レビューの限界」。API は `curl` で呼ぶ(画面はプラン2) |
| 9 | レビュー | `design-reviewer`、`edge-case-reviewer`、`security-reviewer` を並列 | security-reviewer には差分を渡す。テキストが FFmpeg の引数・パス・ログに届かないことを重点的に見てもらう |

- 各タスクは `tdd` スキルで行い、タスクごとにコミットする
- 結合テストはタスク4〜6の中で1件ずつ Red から進める(まとめて書かない)

## 7. コミット前テスト実行

```
docker compose run --rm --build backend pytest
docker compose run --rm --build frontend npx vitest run
docker compose run --rm --build e2e
docker compose --profile e2e down
```

3つともすべて通ることを確かめてからコミットする。フォントを入れたことでイメージが作り直しになるため、最初の1回は時間がかかる。

## 8. スコープ外

- 画面(テキストの場面の追加・編集・表示。プラン2)
- 文字の大きさ・位置・書体・色・背景色の指定、フェードなどの演出
- 絵文字の表示(拒否する)
- 文字の大きさの下限(要件の既知の制限)
- テキストの場面の結合前のプレビュー
- OCR による文字の読み取りの検証(Q16。人が手動で確かめる)
- 旧形式(`video_ids`)の本文の受け付け

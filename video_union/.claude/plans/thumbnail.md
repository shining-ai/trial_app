# プラン: 結合リストに動画のサムネイルを表示する

元資料: `docs/requirements/thumbnail.md`

## 決定事項

| # | 論点 | 決定 | 理由 |
|---|---|---|---|
| Q1 | 表示する一覧 | 結合リストのみ | ユーザーの回答。並べ替えのときに見分けたいため |
| Q2 | 切り出す位置 | 先頭のコマ | ユーザーの回答 |
| Q3 | 大きさ | 表示の枠 120×68px。画像は2倍の解像度(240×135 の枠に収める)で作る | ユーザーの回答(幅120px程度)。高精細の画面でもぼやけない |
| Q4 | 作る場所 | アップロードのとき、バックエンドのFFmpegで作る | 受け付ける形式(AVI・WMV・FLV・MKV など)の多くはブラウザで再生できず、ブラウザ側では作れない |
| Q5 | 作れなかったとき | アップロードを 422 `not_a_video` で失敗にする(ffprobe の失敗と同じ扱い)。画面で画像を読み込めなければ「画像なし」の枠 | 当初は「成功にして記録だけ」としたが、`logging.md` の「エラーを握りつぶさない」に反する。先頭のコマを復号できない動画は結合(`-xerror`)でも失敗するので、アップロードの時点で断るほうが利用者にもわかりやすい |
| Q6 | 置き場所(機能) | 作る・返す・消すは upload 機能(`/api/videos/{id}` の資源)、表示は merge 機能の画面 | 動画の削除(`DELETE /api/videos/{id}`)と同じ扱い |
| Q7 | 時間の上限 | 設定 `thumbnail_timeout_seconds`(既定60秒、環境変数 `THUMBNAIL_TIMEOUT_SECONDS`) | 既存の ffprobe の上限と同じ考え方 |

## 1. 概要

アップロードの最後に、先頭のコマを JPEG にして `uploads/<id>.jpg` に保存し、`GET /api/videos/{id}/thumbnail` で返す。結合リストの動画の行で `<img>` として表示する。

## 2. 詳細設計

### バックエンド
- `lib/disk_storage.py`: `upload_thumbnail_path(video_id)` → `uploads/<id>.jpg`
- `lib/config.py`: `thumbnail_timeout_seconds`
- `features/upload/build_thumbnail_args.py`(純粋関数): `(input_path, output_path, video_stream_index) -> list[str]`。`ffmpeg -y -nostdin -v error <入力の制限> -i <入力> -map 0:<映像ストリーム> -frames:v 1 -vf scale=240:135:force_original_aspect_ratio=decrease -q:v 4 -f image2 <出力>`
- `features/upload/make_thumbnail.py`: 引数を組み立てて `run_process` で実行する。失敗は ProcessFailedError のまま送出する(記録は `run_process` が行う)
- `features/upload/upload_video.py`: 本保存のあと、メタ情報を書く前に `make_thumbnail` を呼ぶ。ProcessFailedError は 422 `not_a_video` にする。アップロードが失敗したときの後片付けにサムネイルも含める
- `features/upload/delete_video.py`: サムネイルも消す
- `features/upload/find_thumbnail.py`: パスを返す。ID が不正・ファイルがなければ 404 `thumbnail_not_found`
- `features/upload/router.py`: `GET /api/videos/{video_id}/thumbnail` → `FileResponse(media_type="image/jpeg")`
- 古いファイルの片付け(`cleanup_stale_files`)は uploads の全ファイルを見るので変更不要

### フロントエンド
- `features/merge/VideoThumbnail.tsx`: `<img src="/api/videos/{id}/thumbnail" alt="" data-testid="video-thumbnail">`。読み込みに失敗したら「画像なし」の枠に切り替える。ファイル名がすぐ隣にあるので画像は装飾として扱う(alt="")
- `features/merge/MergeOrderList.tsx`: 動画の行の先頭に `VideoThumbnail` を置く
- `app/app.css`: 枠 120×68px、`object-fit: contain`、暗い背景

## 3. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| `test_upload_api.py` の保存ファイルの一覧 | `<id>.jpg` が増える |
| `test_upload_api.py` の削除のテスト | 名前を「サムネイルも消す」に変える(保存ファイルが空になることの確認はそのまま) |
| `MergeOrderList.test.tsx` | 追加。HTML の特殊文字の名前のテストは「img 要素がない」から「img はサムネイルだけ」に変える |

## 4. 新規テストケース

### 単体(backend)
- `build_thumbnail_args`: 引数の並び(入力の制限・映像ストリームの指定・1コマ・縮小・出力)。映像ストリームの番号が反映される
- `disk_storage`: `upload_thumbnail_path` の場所、不正な ID の拒否
- `config`: `THUMBNAIL_TIMEOUT_SECONDS` の読み取り

### 結合(backend)
- 赤の動画(640×360)をアップロードすると、サムネイルが 200・`image/jpeg` で返り、240×135 で中央が赤
- 縦長(360×640)なら 76×135 前後(比を保つ)
- 回転情報つき(640×360、90度)なら縦長になる
- 先頭のコマ: 先頭0.5秒が赤・後半が青の動画で、サムネイルは赤
- 存在しない ID・不正な ID は 404 `thumbnail_not_found`
- 動画を削除するとサムネイルも 404 になり、ファイルが残らない
- 動画でないファイルのアップロードでは、サムネイルのファイルが残らない
- ffprobe では読めるが先頭のコマを復号できない動画(moov が先頭の MP4 を mdat の途中で切ったもの)は 422 `not_a_video` で、ファイルが残らない
- `make_thumbnail`: 青の動画から JPEG を作る。動画でない入力、映像でないストリームの番号では ProcessFailedError

### 単体(frontend)
- `VideoThumbnail`: 画像の src が `/api/videos/<id>/thumbnail`。読み込みに失敗すると「画像なし」を表示する
- `MergeOrderList`: 動画の行にはサムネイルがあり、テキストの場面の行にはない

### E2E(`e2e/thumbnail.spec.ts`)
- 赤・緑・青の動画をアップロードすると、結合リストの各行のサムネイルが読み込まれ、画像の中央の色がそれぞれ赤・緑・青(SC-001)

## 5. 実装順

1. バックエンド(単体 → 結合)を `tdd` スキルで
2. フロントエンドの単体を `tdd` スキルで
3. E2E
4. レビュー(design-reviewer・edge-case-reviewer・security-reviewer)

## 6. コミット前テスト実行

testing.md の3つのコマンド(backend pytest、frontend vitest、e2e)がすべて通ることを確かめる。

## 7. スコープ外

- アップロードの状況の一覧への表示、マウスを重ねたときのプレビュー、拡大表示

## 実装のレビューで変えた点

| # | 指摘 | 対応 |
|---|---|---|
| R1(P1、edge-case) | サムネイル作成の時間切れも「動画として読み込めませんでした」(422)になり、壊れた動画と区別できない | 時間切れは 503 `thumbnail_timeout`(「しばらくしてからもう一度」)にした。結合テストを追加 |
| R2(P1、edge-case) | `THUMBNAIL_TIMEOUT_SECONDS` に0以下を入れても起動でき、全アップロードが失敗する | 0以下を起動時に拒否する。0・-1 と 1 の両側の単体テストを追加 |
| R3(P2) | 削除の途中で失敗するとメタ情報だけ残りうる | サムネイルを先に消す順にした |
| R4(P2) | image2 の出力名の `%` が連番のパターンになる | `-update 1` を付けた |
| R5(P2) | テスト名が保存ファイルの増加と合わない | 名前を直した |
| R6(P2、再レビュー) | VideoThumbnail のテストに、alt="" の画像には当たらない無意味なアサーションがある | `document.querySelector("img")` が null であることの確認に替えた |

見送った P2(再レビュー分を含む): ディスク不足で JPEG を書けないときも 422 になる(まれ)。`video_stream_index` が None の可能性(ffprobe の判定で映像があるときだけ通る)。ffprobe の時間切れも 422 になる(既存の挙動で、この機能の範囲外)。`FFPROBE_TIMEOUT_SECONDS` の0以下の拒否(同)。サムネイルだけが残ったときに DELETE が 404 になる(作成は本保存のあと・失敗時は消すため、通常は起きない)。削除とサムネイル取得が重なると 500 になりうる(利用者1人のため)。ffmpeg が成功で終わってファイルがない場合の確認(7.1 では失敗の終了コードになることを確認済み。画面は「画像なし」になる)。画面で一度失敗すると読み直さない。`videoId` の URL エンコード(ID はサーバーが作る16進数)。

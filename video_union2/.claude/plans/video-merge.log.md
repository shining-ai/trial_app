# 作業記録: 動画の結合機能(Step 3〜6)

プラン: [video-merge.md](video-merge.md)。途中の判断は、止まらずにおすすめの案で進め、その内容と理由をここに残す。

## 進め方の判断

- **ブランチ:** `main`(`4e1955c`)から `feature/video-merge` を作って作業する

## Step 3 テスト網羅のレビュー

サブエージェント1体(general-purpose)に、3つのプランの「新規テストケース」を、要件定義と testing.md に照らしてレビューさせた。提案は追加17件(T1〜T17)と、削除・移動3件(B1〜B3)。

### 採用したもの

| # | 内容 | 反映先 | 理由 |
|---|---|---|---|
| T1 | 映像1秒・音声2秒の動画の長さが映像の長さ(1.0秒)になる | upload.md 単体・結合 | FR-008「映像の長さで数える」の片側しかなかった |
| T2 | 映像と音声の長さが違う動画同士の結合で、音声が切られ・無音で埋まる | merge.md 結合 | FR-008 の音声の扱い。`apad`+`-shortest` の組み合わせは実際の動きで確かめる必要がある |
| T3 | MPEG-TS・PS、WMV、FLV の許可、`apng`・`webp_pipe` の拒否 | upload.md 単体 | FR-013 の許可リストのうち未テストの形式があった |
| T4 | 正方形 2160x2160 の許可・2161x2161 の拒否(短辺側の超過) | upload.md 単体 | 短辺側の境界が抜けていた。メッセージの上限は R7 のとおり「幅≧高さは横長」で 3840x2160 とし、ユーザー確認は不要と判断 |
| T5 | 回転90の動画の、表示サイズでの上限判定 | upload.md 結合 | FR-008「表示サイズで判定」と上限の判定のつながりが未確認だった |
| T6 | 解像度超過のあと、ファイルが残らない | upload.md 結合 | 失敗側の後片付けの確認が抜けていた |
| T7 | 浮動小数の誤差が出る合計でも1800秒ちょうどを許可する | merge.md・merge-ui.md 単体 | 境界の誤判定と、画面とサーバーの食い違いを防ぐ。合計はミリ秒に丸めて比べると決めた |
| T8 | 1段目の引数の `setsar`・`fps`・`format`・`0:v:0`・音声フィルター | merge.md 単体 | FR-011〜013 の引数がテストで固定されていなかった |
| T9 | 音声ストリームが2つのときは最初のものを使う | upload.md 単体 | FR-013 の音声側が抜けていた |
| T10 | 解像度が違う動画の結合で、拡大されず中央に置かれ余白が黒いことを複数の点で確かめる | merge.md 結合 | 受け入れシナリオ2。1点だけでは拡大・中央配置を確かめられない |
| T11 | 44.1kHz・モノラルの音声が 48kHz・2ch に変換される | merge.md 結合 | 入力が最初から 48kHz・ステレオだと変換しなくても通ってしまう |
| T12 | 起動時の掃除の24時間の境界の両側と、起動処理から呼ばれること | upload.md 結合 | 境界の片側と、FR-015「起動時に」の確認が抜けていた |
| T13 | 本数の枠の境界(99本・100本)と、上限に達したときの表示 | upload.md 単体 | FR-009「上限に達したことを表示」の表示側が抜けていた |
| T14 | 超過から許可に戻る切り替わり(削除・追加で合計が更新される) | merge-ui.md 単体 | FR-009「追加・削除のたびに」の切り替わりが抜けていた |
| T15 | E2E で30分超過の表示と結合ボタンの無効化を確かめる | merge-ui.md E2E | 受け入れシナリオ3だけ E2E がなかった。16x16・1fps・901秒の動画なら数秒で作れる。E2E が十数秒延びるのは許容 |
| T16 | 409・実行中の404のテストで、最初の結合が先に終わらないようにする | merge.md 結合 | 短い動画だと結果が安定しない(テストの独立性・安定性) |
| T17 | 4GB の判定をバイト数(4294967296)で固定する | upload.md 単体 | 4×10^9 と 2^32 の取り違えで画面とサーバーがずれるのを防ぐ |
| B1 | 結合テストの507(`disk_space` の差し替え)を外し、単体テストだけにする | merge.md | testing.md に「ディスク容量不足ならモックを許可」という記述はなく、結合テストではアプリ内部のモックを禁じている。testing.md を書き換えて例外を作るより、規約に合わせるほうを選んだ |
| B2 | E2E の「1本だけでは結合ボタンが押せない」を削除し、単体だけで確かめる | merge-ui.md | 画面の中で完結する分岐で、単体で確かめている。E2E は T15 に置き換えた |
| B3 | 起動時の掃除の削除失敗を、権限ではなく「中身のあるフォルダ」で作る | upload.md 結合 | コンテナは root で動くため、権限を外しても削除は失敗せず、異常系が成り立たない |

### 見送ったもの

なし(17件の追加提案と3件の削除・移動提案をすべて採用した)。

### その他の判断

- **テスト用の動画以外のフィクスチャ:** プランでは静止画・HLS・ffconcat も `fixtures/` に置く予定だったが、静止画は FFmpeg で作れ、HLS・ffconcat は参照先のパスがテストごとに変わるため、テストの中で作ることにした(testing.md「作れないものだけを fixtures に置く」)。`fixtures/` には `not_a_video.mp4` だけを置く

## Step 4 実装

### 進め方の判断

- **Step 4 と Step 5 の重なり:** 指示では Step 4 で実装し、Step 5 でテストを先に失敗させてから実装を直す順になっている。一方、`.claude/rules/testing.md` と tdd スキルは「新しいテストは、先に失敗(Red)を確認してから実装する」と定めている。実装を先に書くと Red を確かめられなくなるため、Step 4 の中でモジュールごとにテストを先に書き、Red を確かめてから実装した。Step 5 では、プランの新規テストケースがすべてテストコードになっているかの突き合わせと、全テストの実行を行う
- **1件ずつではなくモジュールごと:** tdd スキルは1件ずつ Red → Green を回す手順だが、テストの件数が多いため、モジュールごとにテストをまとめて書き、関数の外形だけを作った状態で全件が「未実装の振る舞い」で失敗することを確かめてから実装した。import エラーや構文エラーを Red に数えないよう、外形は `NotImplementedError` を送出する形にした
- **担当の割り当て:** frontend(プラン1のタスク7・8、プラン3のタスク1〜3)は、プランどおり Sonnet のサブエージェント1体に任せ、backend と並行して進めた。触ってよい範囲を `frontend/` に限り、コミットはメインが差分とテストを確かめてから行った。backend と E2E は、FFmpeg・ジョブ・セキュリティの判断が多く、ファイル間の整合を保つため、Haiku・Sonnet に割り当てていたタスク(テスト用の補助関数、掃除、進み具合、ダウンロード、E2E の土台)もメインで行った
- **開発中のテストの実行:** backend のソースはコンテナにマウントされているため、開発中は `--build` なしで実行し、最後の確認(Step 5)で `--build` 付きのコマンドを使った
- **FFmpeg の機能の確認:** 実装前に、コンテナの FFmpeg 7.1 で `-protocol_whitelist`・`-format_whitelist`・`-display_rotation`・VP9・MPEG-4 Part 2 が使えること、ffconcat が許可リストで拒否されることを確かめた

### プランにない変更

[video-merge.md](video-merge.md) の「実装で追加・変更した点」(I1〜I12)に追記した。I1(許可リストを lib に置く)は実装の途中で判断し、その場でプランの記述と照らして決めた。それ以外は、実装しながら気づいた細部で、プランへの追記は実装の後になった(指示の「追記してから実装」の順を守れなかった点として記録する)。

### frontend(Sonnet のサブエージェント)

- 全ファイルとも、関数の外形だけを作って中立な値を返す状態で実行し、assert の不一致で失敗(Red)することを確かめてから実装した(`apiClient`・`formatDuration`・`checkFileSize`・`limitSelection`・`pickNextUploads`・`uploadVideo`・`UploadList`・`UploadForm`・`useUploadQueue`・`moveItem`・`checkMergeable`・`formatExcess`・`VideoOrderList`・`useMergeQueue`・`MergeSummary`・`MergeButton`・`MergeProgress`・`useMergeJob`・`DownloadLink`・`deleteVideo`・`requestMerge`・`fetchMergeJob`・`App`)
- **最初から通ったテスト:** 外形だけの関数が返す中立な値(false、空配列、null、何も描画しない)とたまたま一致した否定側のケース(`apiFetch` の204、`checkFileSize` の4294967297の拒否、`pickNextUploads` の送信中2本、`remainingSlots` の100本、`moveItem` が元の配列を変えない、描画の「出ない」系、`useMergeJob` のアンマウント後)。同じファイルの肯定側のケースが Red だったため、実装済み・assert が弱いのどちらでもないと判定。アンマウントのテストだけは、実装の後片付けを外すと失敗することを確かめた
- **プランにない判断(サブエージェントが行い、メインが確認して採用):**
  - `formatDuration` は upload の `UploadList` でも使うため、プランの「2つ目の利用が出たら lib に移す」に従い `src/lib/formatDuration.ts` に置いた
  - プランにないテストを足した: `apiClient`、`uploadVideo`(偽の XHR)、`deleteVideo`・`requestMerge`・`fetchMergeJob`(fetch の差し替え)、`App` の配線。差し替えは通信の制御に限る
  - 残り枠の計算 `remainingSlots` を `limitSelection.ts` に同居させた
  - 4GB 超のファイルは枠を使わずにその場で失敗の項目にする
  - サーバーの message が得られないとき(通信の失敗、JSON でない応答)だけ使う画面側の文言を決めた(「サーバーに接続できませんでした」など)
  - 状態の問い合わせが失敗したら、そのジョブを失敗として止める。結合が断られたときは前回のジョブ(ダウンロードリンク)を残す
- **残った論点:** 超過の文言が `MergeSummary` と `MergeButton`(押せない理由)の両方に出る。プランの画面構成どおりなので変えない。E2E では表示箇所を限定して選ぶ

## Step 5 テストの実装と全通過

### Red の確認

テストはモジュールごとに先に書き、関数の外形だけの状態で失敗することを確かめてから実装した(Step 4 の「進め方の判断」)。backend と E2E の記録は下の表のとおり。frontend は Step 4 の「frontend(Sonnet のサブエージェント)」に書いた。

| テストファイル | Red の確認(失敗の内容) | 最初から通ったテスト |
|---|---|---|
| tests/support/test_support_helpers.py | 補助関数のテスト。最初の実行で2件失敗(可変フレームレートの時刻の読み取り、1x1 の切り出しが yuv420p で不可)→ 補助関数を修正 | 5件(補助関数自体の確認で、本番コードの Red ではない) |
| tests/unit/lib/test_config.py | NotImplementedError で3件失敗 | なし |
| tests/unit/lib/test_disk_storage.py | NotImplementedError で全件エラー | なし |
| tests/unit/lib/test_generate_id.py | NotImplementedError で2件失敗 | なし |
| tests/unit/lib/test_request_context.py | NotImplementedError で2件失敗 | なし |
| tests/integration/lib/test_run_process.py | NotImplementedError で5件失敗 | なし |
| tests/integration/test_health.py | create_app 未実装でエラー | なし |
| tests/unit/features/upload/test_build_probe_args.py | NotImplementedError で失敗 | なし |
| tests/unit/features/upload/test_parse_probe_output.py | NotImplementedError で12件失敗 | なし |
| tests/unit/features/upload/test_validate_video_info.py | NotImplementedError で全件失敗 | なし |
| tests/unit/lib/test_media_input_policy.py | 許可リストを lib に移したときに、実装と同時に書いたため先に Red を確かめていない。代わりに実装を壊して(判定を常に True、プロトコルに http を追加)2件が失敗することを確かめ、元に戻した | (上記のとおり) |
| tests/integration/features/upload/test_upload_api.py | ルートが未実装のため18件失敗(404 など) | `test_error_messages_do_not_contain_storage_paths` が最初から通った。ルートがない404の応答にもパスが含まれないためで、assert が弱いと判定。状態コード422と共通のエラーの形の確認を足し、失敗することを確かめた |
| tests/integration/lib/test_cleanup_stale_files.py | NotImplementedError で5件失敗 | なし |
| tests/integration/lib/test_disk_space.py | NotImplementedError で2件失敗 | なし |
| tests/unit/features/merge/test_plan_output_format.py、test_format_excess.py、test_validate_merge_request.py | NotImplementedError で全件失敗 | なし |
| tests/integration/features/merge/test_load_merge_sources.py | NotImplementedError で全件失敗。実装後、テストの準備が動画ファイルを作っていなかったため2件失敗し、準備を直した(「動画ファイルがないメタ情報は422」のテストを追加) | `test_metadata_without_video_file_is_rejected` は実装の後に足したため最初から通った(実装済みの振る舞い。動画ファイルの存在確認を消すと失敗することを確かめた) |
| tests/unit/features/merge/test_build_normalize_args.py、test_build_concat_list.py、test_build_concat_args.py | NotImplementedError で14件失敗 | なし |
| tests/unit/features/merge/test_parse_progress.py、test_calculate_progress.py | NotImplementedError で全件失敗 | なし |
| tests/integration/features/merge/test_merge_api.py、tests/integration/features/download/test_download_api.py、tests/unit/features/download/test_build_download_name.py | ルート・関数が未実装のため27件失敗 | `test_path_traversal_in_job_id_cannot_reach_uploads` が最初から通った。`%2F` がパスの区切りに戻ってルートに一致せず404になるためで、実装の有無を区別できない(assert が弱い)と判定。テストは残し、アップロード動画のIDをジョブIDとして渡すと共通のエラー形式の404になるテストを足した(これは Red を確認) |
| e2e/uploadMergeDownload.spec.ts、uploadErrors.spec.ts、mergeLimits.spec.ts | 実装の後に書いたため、6件とも最初から通った(実装済み)。assert の強さは、実装をわざと壊して確かめた: 送る ID の順を逆にする→並び順のテストが失敗、出力の高さを最小値にする→縦長の結合が失敗、frontend の上限を3600秒にする→30分超過のテストが失敗、動画でないときの文言を変える→動画でないファイルのテストが失敗。削除のテストは壊していない | 6件(実装済みと判定) |
| Step 5 で足した3件(突き合わせで「一部」だった項目) | 実装済みのため最初から通った。実装を壊して確かめた: ID の形式の確認を外す→`test_ids_pointing_outside_uploads_are_not_read` が失敗、`0:a:0` を `0:a:1` にする→`test_first_audio_track_is_used_when_there_are_two` が失敗 | `test_playlist_referring_to_a_url_does_not_make_the_server_connect` は、入力の許可リストを外しても通った。FFmpeg 自体が、標準外の拡張子の HLS を検出せず、concat も安全モードで URL を拒否するため。許可リストの効き目は `test_ffconcat_list_is_refused_by_format_whitelist`(stderr の「not on whitelist」)と単体テストで確かめており、このテストは「サーバーから外部に接続しない」振る舞いを守るものとして残す |

### プランの新規テストケースとの突き合わせ

サブエージェント(Sonnet)に、3つのプランの「新規テストケース」139項目とテストコードを、assert の中身で突き合わせさせた。結果は、対応あり136・一部3・なし0。

| 「一部」だった項目 | 対応 |
|---|---|
| upload.md「音声ストリームが2つあるときは最初のものを使う(T9)」 | `VideoInfo` は音声の有無しか持たず、upload では区別できない。最初の音声を使うのは結合(`0:a:0`)なので、1本目が無音・2本目が正弦波の動画を結合して出力が無音になる結合テスト `test_first_audio_track_is_used_when_there_are_two` を足した。単体テストの名前は「音声が2つでも音声ありになる」に改めた |
| upload.md「再生リストが参照する動画ファイルが開かれない」 | 参照先をローカルの待ち受けポートの URL にした HLS と ffconcat を送り、サーバーから接続が来ないことを確かめる `test_playlist_referring_to_a_url_does_not_make_the_server_connect` を足した |
| merge.md「`video_ids` に `../uploads/x` を入れても保存先の外のファイルを読まない」 | 保存先の外に本物と同じ形のメタ情報と動画を置き、`../evil` を指定しても422になる `test_ids_pointing_outside_uploads_are_not_read` を足した |

- **プランの値との違い:** upload.md の T5・T6 は 641x360 だが、結合テストでは 642x360 を使った。H.264(yuv420p)は奇数の幅の動画を作れないため。641 の境界そのものは単体テスト `test_limits_come_from_settings` で確かめている

### コミット前テスト実行(全通過)

```
$ docker compose run --rm --build backend pytest
tests/unit/lib/test_request_context.py ..                                [100%]

============================= 171 passed in 28.12s =============================

$ docker compose run --rm --build frontend npx vitest run
 ✓ tests/unit/lib/formatDuration.test.ts (8 tests) 7ms
 Test Files  23 passed (23)
      Tests  137 passed (137)
   Duration  3.82s (environment 77%, tests 9%, transform 7%, import 7%)

$ docker compose run --rm --build e2e
Running 6 tests using 1 worker
  ✓  1 [chromium] › home.spec.ts:3:1 › トップ画面を開くと見出しにアプリ名「動画結合アプリ」が見える (221ms)
  ✓  2 [chromium] › mergeLimits.spec.ts:4:1 › 結合後の長さが30分を超えると、超えた時間が表示され結合ボタンを押せない (432ms)
  ✓  3 [chromium] › uploadErrors.spec.ts:4:1 › 動画でないファイルはその項目だけ失敗し、一緒に選んだ動画は結合リストに入る (314ms)
  ✓  4 [chromium] › uploadErrors.spec.ts:17:1 › 結合リストの項目を削除すると一覧から消える (432ms)
  ✓  5 [chromium] › uploadMergeDownload.spec.ts:23:1 › 並べ替えた順番どおりに結合され、最後まで再生できる動画をダウンロードできる (2.6s)
  ✓  6 [chromium] › uploadMergeDownload.spec.ts:43:1 › 横長と縦長を結合すると、幅と高さそれぞれの最大値の動画になる (2.0s)
  6 passed (30.6s)

$ docker compose --profile e2e down
 Network video_union2_default Removed 
```

上の実行のあと、突き合わせで足した3件を含めて backend を再実行し、174件が通った。

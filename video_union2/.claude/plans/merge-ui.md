# プラン3: 並べ替え・結合・ダウンロードの画面

目次と共通の決定事項: [video-merge.md](video-merge.md)
前提: プラン1([upload.md](upload.md))のアップロード画面と、プラン2([merge.md](merge.md))の結合・ダウンロードAPIが完成していること

## 1. 概要

アップロードした動画を一覧で並べ替え、合計の長さを見ながら結合を始め、進み具合を表示し、完了したらダウンロードできる画面を作る。最後に、アップロードからダウンロードまでの通しのE2Eテストを作る。

対象の要件: FR-002、FR-004、FR-009(画面側の確認と表示)

## 2. 背景

- 上限を超えたことは、サーバーに送る前に画面で知らせる(FR-009)。本数と合計の長さは並べ替え・追加・削除のたびに変わるため、判定は純粋関数にして単体テストする
- 並べ替えは、ライブラリが不要でキーボードでも操作でき、E2Eで確実にテストできるボタン方式にする(Q18)
- 結合はジョブなので、画面は開始後に状態を定期的に問い合わせる(Q1)
- 一覧は React の状態だけに持つ。再読み込みで消える(Q7)

## 3. 詳細設計

### 画面の構成(上から)

1. 見出し「動画結合アプリ」
2. アップロード(プラン1の `UploadForm`、`UploadList`)
3. 結合リスト: 並び順の番号、ファイル名、長さ、解像度、「上へ」「下へ」「先頭へ」「末尾へ」「削除」のボタン
4. 合計の長さ(例: 「合計 12:34 / 30:00」)。30分を超えたら「30分を2:15超えています」と表示する
5. 結合ボタン。押せない理由を横に1つだけ表示する(重なったときは 結合中 > アップロード中 > 本数 > 長さ の順)
6. 進み具合(結合中のみ、%)。失敗したらサーバーのメッセージを表示する
7. ダウンロードリンク(完了後のみ)

### ボタンの状態

| 状態 | 結合ボタン | 並べ替え・削除 | 表示 |
|---|---|---|---|
| 2本未満 | 押せない | 押せる | 「結合するには2本以上の動画が必要です」 |
| 30分超過 | 押せない | 押せる | 超えた時間 |
| アップロード中 | 押せない | 押せる | 「アップロードの完了を待っています」 |
| 結合中 | 押せない | 押せない | 進み具合(アップロードは続けられる) |
| 完了 | 押せる | 押せる | ダウンロードリンク。並べ替えると古い結果のリンクは消す |
| 失敗 | 押せる | 押せる | 失敗のメッセージ |

- 先頭の「上へ」「先頭へ」、末尾の「下へ」「末尾へ」は押せない
- 「削除」は `DELETE /api/videos/{id}` を呼び、成功したら一覧から外す(Q6)。失敗したら一覧に残してメッセージを出す
- 409(別の結合が実行中)を受けたら「別の結合が実行中です」と表示する
- 結合中もアップロードを続けられる(結合リストへの追加だけ行い、実行中のジョブには影響しない)

### フロントエンドのファイル

**結合 `frontend/src/features/merge/`**

| ファイル | 担当(一文) |
|---|---|
| `types.ts` | 結合リストの項目、`MergeJobResponse` の型を定義する |
| `moveItem.ts` | 配列の要素を「上へ」「下へ」「先頭へ」「末尾へ」動かした新しい配列を返す純粋関数 |
| `checkMergeable.ts` | 本数・合計の長さ・アップロード中・結合中から、結合できるかと理由(超過時間を含む)を返す純粋関数 |
| `formatDuration.ts` | 秒数を `m:ss`(1時間以上は `h:mm:ss`)の文字列にする純粋関数 |
| `useMergeQueue.ts` | 結合リストの状態(追加・削除・並べ替え)を管理する |
| `requestMerge.ts` | `POST /api/merges` を呼ぶ |
| `fetchMergeJob.ts` | `GET /api/merges/{job_id}` を呼ぶ |
| `useMergeJob.ts` | 結合を始め、完了か失敗まで1秒ごとに状態を問い合わせる |
| `VideoOrderList.tsx` | 結合リストと並べ替え・削除のボタンを表示する |
| `MergeSummary.tsx` | 合計の長さと超過時間を表示する |
| `MergeButton.tsx` | 結合ボタンと、押せない理由を表示する |
| `MergeProgress.tsx` | 進み具合と失敗のメッセージを表示する |

**ダウンロード `frontend/src/features/download/`**

| ファイル | 担当(一文) |
|---|---|
| `DownloadLink.tsx` | 完了したジョブのダウンロードリンク(`/api/merges/{job_id}/download`)を表示する |

**`frontend/src/app/App.tsx`**: アップロードの完了を `useMergeQueue` に渡し、各コンポーネントを並べる。プラン1で `App.tsx` に持たせた配列は `useMergeQueue` に置き換える。

- `formatDuration.ts` はプラン1の `UploadList`(長さの表示)でも使いたくなる。architecture.md の「まず各機能に置く」に従い、2つ目の利用が出た時点で `frontend/src/lib/` に移すかを判断する

### アクセシビリティとテストのためのラベル

- 並べ替えボタンは `aria-label` に「{ファイル名} を上へ」のように対象を含める(E2E で role と name で選ぶため)
- 結合リストは `<ol>`、各項目は `<li>` にする

### E2E の土台

- E2E のコンテナで動画を作れるよう、`e2e/Dockerfile` に FFmpeg を入れる
- `e2e/global-setup.ts` で、テスト前に赤・緑・青(各1秒・320x180)、縦長(180x320)、テキストの `not_a_video.mp4` を一時ディレクトリに作る
- ダウンロードしたファイルは、E2E のコンテナの ffprobe で長さ・解像度を確かめる

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| `frontend/tests/unit/app/App.test.tsx` | `App` の構成が変わる。見出しの検証はそのまま通ることを確かめる |
| プラン1の `useUploadQueue.test.ts`、`UploadList.test.tsx` | アップロード完了の受け渡し先が `useMergeQueue` に変わる。テストの期待値は変えない |
| `e2e/home.spec.ts` | 影響なし |
| `e2e/Dockerfile` | FFmpeg を入れるため、イメージの作り直しに時間がかかる |

## 5. 新規テストケース

### フロントエンド単体(`frontend/tests/unit/features/`)

**`merge/moveItem.test.ts`**
- [A,B,C] の B を「上へ」で [B,A,C]、「下へ」で [A,C,B]、C を「先頭へ」で [C,A,B]、A を「末尾へ」で [B,C,A]
- 先頭の「上へ」・末尾の「下へ」は同じ並びを返す(元の配列は変更しない)
- 1要素・存在しない位置の指定でも例外にならず同じ並びを返す

**`merge/checkMergeable.test.ts`**
- 2本・合計1800秒ちょうどは結合できる
- 1本・0本は「2本以上が必要」
- 合計1800.001秒は不可で、超過0.001秒を返す。合計1935秒なら超過135秒
- アップロード中・結合中は不可で、それぞれの理由を返す
- 複数の理由が重なるときは、結合中 > アップロード中 > 本数 > 長さ の順で1つ返す

**`merge/formatDuration.test.ts`**
- 0 → `0:00`、59.9 → `0:59`、60 → `1:00`、1800 → `30:00`、3600 → `1:00:00`(端数は切り捨て)

**`merge/VideoOrderList.test.tsx`**
- 3件を並び順どおりに番号付きで表示する
- 「B を上へ」を押すと並びが変わったことを通知する。先頭の「上へ」は押せない
- 結合中は並べ替え・削除のボタンが押せない

**`merge/MergeButton.test.tsx`、`MergeSummary.test.tsx`**
- 結合できないときはボタンが押せず、理由が表示される
- 合計 12:34 / 30:00 を表示し、超過時は超過時間を表示する

**`merge/useMergeJob.test.ts`**
- 開始後、`running` の間は問い合わせを続け、`succeeded` で止まる。`failed` ならメッセージを返して止まる
- 409 の応答で「別の結合が実行中です」を返す
- (時間の進みは Vitest の偽のタイマーで制御する。API の応答は、状態の移り変わりを順に返す差し替えにする)

**`download/DownloadLink.test.tsx`**
- ジョブIDから `/api/merges/{job_id}/download` へのリンクを表示する

### E2E(`e2e/`。アプリ全体、モックなし)

**`uploadMergeDownload.spec.ts`**
- 赤・緑・青をアップロードし、青を「先頭へ」動かして結合すると、進み具合が表示されたあとダウンロードリンクが出る。ダウンロードしたファイルの長さが3秒±1フレーム、解像度が320x180
- 赤(横長)と縦長をアップロードして結合すると、ダウンロードしたファイルの解像度が320x320

**`uploadErrors.spec.ts`**
- `not_a_video.mp4` を選ぶと、その項目に「動画として読み込めませんでした」が表示され、結合リストには入らない。同時に選んだ正しい動画はリストに入る
- 1本だけでは結合ボタンが押せず、「結合するには2本以上の動画が必要です」が表示される

30分・100本・4GBの超過の表示は、E2E では実ファイルを作れないため、フロントエンド単体テスト(`checkMergeable`、プラン1の `limitSelection`・`checkFileSize`)で確かめる。

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 1 | 純粋関数(`moveItem`、`checkMergeable`、`formatDuration`) | Sonnet のサブエージェント | 仕様と境界値がプランで確定している |
| 2 | `useMergeQueue.ts`、`VideoOrderList.tsx`、`MergeSummary.tsx` と `App.tsx` への組み込み | Sonnet のサブエージェント | |
| 3 | `requestMerge.ts`、`fetchMergeJob.ts`、`useMergeJob.ts`、`MergeButton.tsx`、`MergeProgress.tsx`、`DownloadLink.tsx` | Sonnet のサブエージェント | 結合中・完了・失敗の状態の切り替え |
| 4 | E2E の土台(`e2e/Dockerfile` への FFmpeg、`global-setup.ts`) | Haiku のサブエージェント | 定型作業 |
| 5 | E2E テスト(`uploadMergeDownload.spec.ts`、`uploadErrors.spec.ts`) | メイン(Opus) | 画面とAPIをまたぐ確認。失敗時の原因の切り分けが必要 |
| 6 | 手動確認: 実際のスマホ動画・4K動画で、アップロードから結合・ダウンロードまでを1回通す | ユーザー | review.md「静的レビューの限界」。表示崩れ・処理時間を見る |
| 7 | レビュー | `design-reviewer`、`edge-case-reviewer`、`security-reviewer` を並列 | |

- 各タスクは `tdd` スキルで行い、タスクごとにコミットする

## 7. コミット前テスト実行

```
docker compose run --rm --build backend pytest
docker compose run --rm --build frontend npx vitest run
docker compose run --rm --build e2e
docker compose --profile e2e down
```

3つともすべて通ることを確かめてからコミットする。

## 8. スコープ外

- ドラッグ&ドロップでの並べ替え(Q18)
- サムネイル・プレビュー再生(Q19)
- 再読み込み後の一覧・ジョブの復元(Q7)
- 実行中の結合の中止
- 結合結果の画面内での再生

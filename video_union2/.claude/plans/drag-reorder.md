# プラン: ドラッグで結合リストの順番を並べ替える

元資料: `docs/requirements/drag-reorder.md` / 作業記録: [drag-reorder.log.md](drag-reorder.log.md)

## 決定事項(確認事項はすべて推奨案で決めた)

| # | 論点 | 決定 | 理由 |
|---|---|---|---|
| Q1 | 対象 | 結合リストの中の並べ替えだけ。動画とテキストの場面の両方 | 要件のストーリー1 |
| Q2 | 既存のボタン | 「上へ」「下へ」「先頭へ」「末尾へ」は残す | 細かい移動と、ドラッグが使いにくい環境の代わり(FR-009) |
| Q3 | つかむ場所 | マウス・タッチは行(パネル)のどこでもつかめる。キーボードは各行の左のつまみ(⋮⋮)だけでつかむ。つまみは「つかめる」目印として残す | ユーザーの要望で変更(当初は「つまみだけ」)。マウスは4ピクセル動かすまで、タッチは長押しまで始まらないので、行の中のボタンのクリック・タップとは区別できる。キーボードをつまみに限るのは、行の中のボタンでスペースキーを押したときにドラッグを始めないため(dnd-kit のキーボードは、操作の受け口に指定した要素からしか始まらない) |
| Q4 | ライブラリ | `@dnd-kit/core` 6.3.1・`@dnd-kit/sortable` 10.0.0・`@dnd-kit/utilities` 3.2.2 を `dependencies` に固定の版で入れる。lock は `npm install` で更新し、Docker は `npm ci` で入れる | マウス・タッチ・キーボードの3つに対応し、読み上げの文言を差し替えられる。HTML5 のドラッグ&ドロップはタッチで動かない |
| Q5 | 開始の条件 | マウスは4ピクセル動かしたら開始。タッチは250ミリ秒の長押し(5ピクセルまでのずれは許す)。キーボードはスペースキーでつかみ、スペースキーで置き、Esc キーで取り消す(Enter は使わない) | クリック・スクロールとの区別(FR-006)。要件どおりの操作だけにする(レビュー P2-B8) |
| Q6 | 読み上げ | つかんだ・動かした・置いた・取り消した、と操作の説明、役割の説明(`aria-roledescription`)をすべて日本語にする。位置は「n 番目」 | FR-005・SC-004。dnd-kit の既定の役割の説明は英語の "sortable"(レビュー P1-B3・T6) |
| Q7 | ロック | 入力欄が開いている間と結合中は、つまみを無効にする(ネイティブの `disabled` と `useSortable` の `disabled` の両方)。ドラッグ中にロックがかかったら(キーボードでつかんだまま Tab と Enter で「結合する」「編集」を押した場合など)、Esc キーの操作を送ってドラッグを取り消す(実装レビュー ラウンド1で変更)。離した時点(`onDragEnd`)でもロックを確かめ直す。状態の側(`moveById`)は、既存の `move` と同じく入力欄が開いているかだけを見る | FR-007。結合中かどうかは `useMergeJob` が持ち、`useMergeQueue` からは見えない。ドラッグ中にロックがかかっても dnd-kit は進行中のドラッグを止めない(レビュー P1-D1・P2-D2・B5) |
| Q8 | 並べ替えの基準 | 番号ではなく、動かす項目の id と、離した位置の項目の id で並べ替える。状態は関数で更新する | text-merge の実装レビュー J-6(削除の完了を待つ間に番号がずれた)の教訓 |
| Q9 | 当たり判定 | 独自の判定: ポインターが結合リスト(`ol`)の枠の外なら「当たりなし」、中なら `closestCenter`。キーボード操作(ポインターの位置がない)ときは `closestCenter` | `closestCenter` だけだと一覧の外でも一番近い行が当たり、FR-004 を満たせない(レビュー P0-B1・Step 3 の最大の指摘) |
| Q10 | 自動スクロール | dnd-kit の既定(画面の端に近づくとスクロール) | FR-008 |
| Q11 | 見た目 | 動かしている行は影を付けて浮かせ、他の行は動いて入る位置を空ける。ドラッグ中は行の番号の丸を隠す(DOM の順の番号が古いまま見えるため) | FR-003(レビュー P2-B9) |
| Q12 | タッチ | つまみに `touch-action: manipulation`、`user-select: none`、`-webkit-touch-callout: none` を付ける(`touch-action: none` は使わない)。タッチの長押しと自動スクロールは E2E で行わず、Step 7 で人が実機で確かめる | 長押しの間の文字の選択・長押しメニューを防ぎ、長押しでない指の動きはスクロールのままにする(FR-006。レビュー P1-B4・T13)。Playwright で dnd-kit のタッチの長押しを再現するのは不安定 |
| Q13 | セキュリティ | ファイル名とテキストの1行目は、React の文字として描く(`aria-label` と読み上げの領域を含む)。`dangerouslySetInnerHTML` は使わない。サーバーと FFmpeg の引数は変えない(送るのは今までどおり並び順の `items` だけ) | レビュー P2-S1 |

## 1. 概要

結合リストの各行の左に「つまみ」を付け、マウス・タッチ・キーボードでつかんで動かし、離した位置に並べ替えられるようにする。サーバーは変えない。

## 2. 背景

- 今は「上へ」「下へ」「先頭へ」「末尾へ」のボタンでしか並べ替えられず、動画が多いと何度も押す必要がある(要件のストーリー1)
- video-merge の Q18 でドラッグ&ドロップはスコープ外にしていたが、この要件で扱う
- 結合リストの状態は `useMergeQueue`、表示は `MergeOrderList` にある。並べ替えの計算や判断は純粋関数に分ける方針(architecture.md)

## 3. 詳細設計

### 純粋関数(`frontend/src/features/merge/`)
- **`moveItemById.ts`**: `(items, activeId, overId) => MergeItem[]`。activeId の項目を、overId の項目の位置へ動かした新しい配列を返す(結果は dnd-kit の `arrayMove` と同じ)。同じ id・見つからない id のときは、同じ並びの新しい配列を返す(既存の `moveItem` と同じく、元の配列とは別のもの)。元の配列は変えない
- **`itemName.ts`**: 行の名前を返す。動画はファイル名、テキストの場面は「テキストの場面: {1行目}」。`MergeOrderList` の各ボタンの `aria-label`、つまみ、読み上げで同じ関数を使う
- **`dragAnnouncements.ts`**: `(items: MergeItem[]) => { screenReaderInstructions, announcements }`。dnd-kit には id しか渡らないので、一覧から名前と位置(1始まり)を引く。「置いた」の番号は `moveItemById(items, active, over)` での位置と一致させる
  - 操作の説明: 「並べ替えるには、スペースキーでつかみ、上下の矢印キーで動かし、もう一度スペースキーで置きます。Esc キーで取り消します。」
  - つかんだ: 「{名前} をつかみました。今は {n} 番目です。」
  - 動かした: 「{名前} を {n} 番目に動かしました。」/ 一覧の外: 「{名前} は一覧の外にあります。」
  - 置いた: 「{名前} を {n} 番目に置きました。」/ 一覧の外で離した: 「{名前} を元の位置に戻しました。」
  - 取り消した: 「並べ替えを取り消しました。{名前} は {n} 番目のままです。」
- **`dragEndToMove.ts`**: `(activeId, overId | null, locked) => { activeId, overId } | null`。over がない・同じ id・ロック中なら null
- **`collisionInsideList.ts`**: `(getListRect: () => DOMRect | null) => CollisionDetection`。ポインターの位置があり、それが一覧の枠の外なら `[]`、それ以外は `closestCenter` の結果

### 状態(`useMergeQueue.ts`)
- `moveById(activeId, overId)` を足す。入力欄が開いている間(`editorRef.current`)は何もしない。`setItems((latest) => moveItemById(latest, activeId, overId))`

### 画面の部品
| ファイル | 担当(一文) | 変更 |
|---|---|---|
| `SortableMergeList.tsx`(新規) | `DndContext`(センサー、独自の当たり判定、日本語の読み上げ)と `SortableContext`(縦の一覧)で `ol` を並べ替えられるようにする | `onDragEnd` で `dragEndToMove` を呼び、結果があれば `onMoveById`。ドラッグ中は `ol` に `merge-list--dragging`。ドラッグ中にロックがかかったら取り消す。読み上げの領域は `body` の直下に出す |
| `suppressFirstSelfOver.ts`(新規。実装レビューで追加) | つかんだ直後の、自分自身の上にいる最初の通知だけを読み上げないようにする | 「つかみました」をすぐ上書きしないため。一度動いたあとに元の位置へ戻ったときは読み上げる |
| `SortableMergeItem.tsx`(新規) | `useSortable` で `li` 1つを並べ替えられるようにし、左端につまみを置いて `children` を描く | つまみ: `<button>`、`aria-label="{名前} をドラッグして並べ替え"`、表示「⋮⋮」、`disabled={locked}`、`useSortable({ id, disabled: locked, attributes: { roleDescription: "並べ替えできる項目" } })` の `attributes` と操作の受け口の指定(`setActivatorNodeRef`)はつまみに付け、`listeners` は `li` に付ける(マウス・タッチは行のどこからでも始まり、キーボードはつまみからだけ始まる。要望で変更)。ドラッグ中は `merge-item--dragging` |
| `useDragSensors.ts`(新規) | マウス(4ピクセル)・タッチ(250ミリ秒、5ピクセル)・キーボード(`sortableKeyboardCoordinates`、`keyboardCodes` はスペースと Esc だけ)のセンサーを返す | テストは書かない(設定値を写すだけになるため。マウス・キーボードは E2E、タッチは手動。レビュー B4) |
| `MergeOrderList.tsx` | 結合リストの行の中身と操作のボタン、入力欄の差し込み | `ol` を `SortableMergeList` に、`li` を `SortableMergeItem` に置き換える。行の名前は `itemName` から取る。props に `onMoveById` を足す。テキストの場面の編集中(行が入力欄に置き換わっている間)も、つまみは無効で表示する |
| `App.tsx` | 画面の組み立て | `onMoveById={mergeQueue.moveById}` を渡す |
| `app/app.css` | 見た目 | つまみ(`cursor: grab`、Q12 のタッチの指定)、ドラッグ中の行(影・前面)、並べ替えのアニメーション、ドラッグ中は番号の丸を隠す |

### テストのための目印
- つまみの名前「{名前} をドラッグして並べ替え」で探す(CSS のクラスには頼らない)
- dnd-kit の読み上げの領域は `body` の直下の `role="status"`。結合ボタンの横にも `role="status"` があるので、E2E では文言で絞り込む

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| `MergeOrderList.test.tsx` | つまみが1行に1つ増えるので、ボタンの数を数えている期待値が変わる(結合中のテスト 19 → 22、入力欄が開いている間のテスト 20 → 23)。つまみはネイティブの `disabled` にするので、「すべて押せない」の確かめにそのまま含まれる。それ以外の期待値(ボタンの名前・入力欄の位置)はそのまま通す。props に `onMoveById` を足す |
| `useMergeQueue.test.ts` | 影響なし(追加のみ) |
| `App.test.tsx` | 影響なし(つまみは `MergeOrderList` の単体テストで確かめ、`onMoveById` の受け渡しは E2E で確かめる。レビュー B2) |
| E2E(既存) | 影響なし。ボタンでの並べ替えはそのまま |

## 5. 新規テストケース

### フロントエンド単体(`frontend/tests/unit/features/merge/`)

**`moveItemById.test.ts`**
- [A,B,C] で C を A の位置へ → [C,A,B]。A を C の位置へ → [B,C,A]。B を C の位置へ → [A,C,B]。B を A の位置へ → [B,A,C]
- [A,T,B] で T を B の位置へ → [A,B,T](テキストの場面も動かせる)
- 同じ id → 同じ並び(元とは別の配列)。存在しない activeId・overId → 同じ並び。[A] で A→A → [A]。[] → []
- 元の配列を変えない

**`itemName.test.ts`**
- 動画 → ファイル名。テキストの場面(1行)→「テキストの場面: 京都」。(2行)→「テキストの場面: {1行目}」

**`dragAnnouncements.test.ts`**(一覧 [red.mp4, テキストの場面: 京都, blue.mp4])
- 操作の説明が上の固定の文
- blue をつかむ → 「blue.mp4 をつかみました。今は 3 番目です。」
- red の上へ動かした → 「blue.mp4 を 1 番目に動かしました。」。一覧の外 → 「blue.mp4 は一覧の外にあります。」
- red の上で置いた → 「blue.mp4 を 1 番目に置きました。」。red を blue の上で置いた → 「red.mp4 を 3 番目に置きました。」。blue を blue の上で置いた → 「blue.mp4 を 3 番目に置きました。」。外で離した → 「blue.mp4 を元の位置に戻しました。」
- 取り消した → 「並べ替えを取り消しました。blue.mp4 は 3 番目のままです。」
- テキストの場面をつかむ → 「テキストの場面: 京都 をつかみました。今は 2 番目です。」
- 3件のすべての組み合わせ(active, over)で、「置いた」の番号が `moveItemById(items, active, over)` での位置 +1 と一致する

**`dragEndToMove.test.ts`**
- ("a", null, false) → null。("a", "a", false) → null。("c", "a", false) → { activeId: "c", overId: "a" }。("c", "a", true) → null

**`collisionInsideList.test.ts`**(ドロップ先の矩形を持たせた引数を作る)
- ポインターが一覧の枠の中 → `closestCenter` と同じ結果(いちばん近い行)
- ポインターが一覧の枠の外(上・下・横)→ `[]`
- ポインターの位置がない(キーボード)→ `closestCenter` と同じ結果
- 一覧の枠が取れない(null)→ `closestCenter` と同じ結果

**`useMergeQueue.test.ts`**(追加)
- `moveById("c", "a")` で [a,b,c] → [c,a,b]
- 挿入の入力欄・編集の入力欄が開いている間は、`moveById` で並びが変わらない
- 削除の完了を待つ間に、activeId 側・overId 側のどちらかが削除中の項目なら、並びが変わらない
- 削除の完了を待つ間に `moveById("c", "b")` で並べ替え、そのあと削除が失敗すると、削除した項目は元の直後の項目の前に戻る
- 画面に反映される前に追加された動画を、`moveById` が上書きしない(関数での更新)

**`MergeOrderList.test.tsx`**(追加)
- 各行のつまみの名前が固定値: 「A.mp4 をドラッグして並べ替え」「テキストの場面: 2026年10月9日 をドラッグして並べ替え」
- つまみの `aria-roledescription` が「並べ替えできる項目」
- つまみの `aria-describedby` が指す要素の文が、操作の説明の固定の文と一致する
- 行の `li` には `aria-roledescription`・`tabindex`・`aria-describedby` が付かない(dnd-kit の属性はつまみにだけ付く。操作の受け口(`listeners`)だけを `li` に付ける)
- 入力欄が開いている間・結合中は、つまみがネイティブの `disabled`。テキストの場面の編集中も、その行のつまみは表示されて無効
- 1件だけの一覧でもつまみがあり、押せる
- キーボード(jsdom で動けば): つまみで Space → 読み上げの領域に「C.mp4 をつかみました。今は 3 番目です。」→ Escape → 「並べ替えを取り消しました。C.mp4 は 3 番目のままです。」、`onMoveById` は呼ばれない。jsdom で不安定なら E2E に任せる

### E2E(`e2e/dragReorder.spec.ts`。アプリ全体、モックなし)
ドラッグは `page.mouse` で行う(つまみの中央へ移動 → down → 10ピクセル動かして開始 → 目標へ `steps: 15` で移動 → さらに数ピクセル → up)。座標はドラッグの直前に取り、待つのは `waitForTimeout` ではなく読み上げの文言・行の並びで行う。ビューポートは縦に広げる(自動スクロールが動かないように)。

- 赤・緑・青をアップロードし、青のつまみを赤の行の上までドラッグして離すと、並びが青・赤・緑になり、結合した動画の 0.5・1.5・2.5秒の色がその順(SC-001)
- 赤・青の間にテキストの場面「■」(1.0秒)を挿入し、そのつまみを青の下までドラッグすると、3番目の行が「📝 ■(1.0秒)」になり、結合した動画の 0.5・1.5・2.5秒が赤・青・白、長さが3秒 ± 許容(SC-002)
- 先頭の赤をつかみ、一覧の下の外(結合ボタンのあたり)まで動かして離すと、並びが赤・緑・青のまま、読み上げに「red.mp4 を元の位置に戻しました。」(SC-003。`closestCenter` のままなら緑か青の位置に入るので、誤りを捕まえられる)
- 青をつかんで赤の行の上まで動かし、読み上げに「blue.mp4 を 1 番目に動かしました。」が出たのを待ってから Esc を押し、離すと、並びが変わらず、読み上げに「並べ替えを取り消しました。」(SC-003)
- キーボード: 青のつまみにフォーカスし、Space →「blue.mp4 をつかみました。今は 3 番目です。」→ 上矢印 →「2 番目に動かしました。」→ 上矢印 →「1 番目に動かしました。」→ Space →「blue.mp4 を 1 番目に置きました。」、並びが青・赤・緑、つまみにフォーカスが残る(SC-004)
- キーボード: Space → 上矢印 → Esc で、並びが変わらず「並べ替えを取り消しました。blue.mp4 は 3 番目のままです。」
- 入力欄を開いている間は、つまみが無効で、ドラッグしても並びが変わらない。入力欄を取り消してから同じ操作をすると、並びが変わる(ドラッグの再現の失敗で空振りしていないことを確かめる。SC-005)
- 青のファイル名の文字の上で押して赤の行まで動かして離すと、並びが青・赤・緑になる。テキストの場面の行の余白からも動かせる(FR-002)
- 行の中のボタン(「blue.mp4 を上へ」)を動かさずに押すと、ドラッグにならずにボタンとして働く(FR-002)
- 行の中の「上へ」ボタンにフォーカスしてスペースキーを押しても、ドラッグは始まらない(読み上げに「つかみました」が出ない)。ボタンとして1つ上がる(FR-002)
- ドラッグ中(離す前)は、読み上げに入る位置(n 番目)が出る(FR-003 のうち自動で確かめられる部分。影や行の動きは Step 7)

結合中のロック(SC-005 の後半)は、結合が短い動画ではすぐに終わり E2E では不安定なため、単体テスト(つまみが無効)で確かめる。

### Step 7 の動作確認の項目
- メイン(Opus)が実際のブラウザで: マウスのドラッグ中の見た目(動かしている行が浮く、入る位置が空く、番号の丸が隠れる)を画面で記録する。長い一覧(動画をたくさん)で、画面の端へドラッグすると一覧がスクロールする
- 人が実機(スマホ)で: 長押しで並べ替わる。長押しせずに指を動かすとスクロールするだけ。長押しの間に文字の選択や長押しメニューが出ない

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 1 | 依存の追加(`npm install --save-exact`) | メイン(Opus) | Step 2 の間に済ませた |
| 2 | 純粋関数(`moveItemById`、`itemName`、`dragAnnouncements`、`dragEndToMove`) | Sonnet のサブエージェント | 仕様と期待値がこのプランで確定している |
| 3 | `collisionInsideList`、`useMergeQueue.moveById`、`useDragSensors`、`SortableMergeItem`、`SortableMergeList`、`MergeOrderList` の組み込み、`App.tsx`、`app.css` | メイン(Opus) | ライブラリの組み込みと、既存のロック・状態の扱いとの整合 |
| 4 | E2E(`dragReorder.spec.ts`) | メイン(Opus) | 実際のブラウザでのドラッグとキーボード操作 |
| 5 | 実装のレビュー(Step 6) | `design-reviewer`・`edge-case-reviewer`・`security-reviewer` の定義で3つ並列 | review.md の手順 |
| 6 | 動作確認(Step 7) | メイン(Opus)が実際のブラウザで操作して画面を記録。タッチは人が実機で確かめる | review.md「静的レビューの限界」 |

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

- ファイルを画面にドラッグ&ドロップしてアップロードすること
- 複数の行をまとめて選んで動かすこと
- アップロードの状況の一覧の並べ替え
- タッチ操作と自動スクロールの自動テスト(Step 7 で確かめる)
- キーボードの Enter でのつかむ・置く

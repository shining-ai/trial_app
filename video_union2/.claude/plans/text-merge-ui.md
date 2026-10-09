# プラン2: テキストの場面の画面と通しの E2E

目次: [text-merge.md](text-merge.md) / 元資料: `docs/requirements/text-merge.md` / 前提: [text-merge-backend.md](text-merge-backend.md) の API

## 1. 概要

結合リストに、動画と並べて「テキストの場面」を挿入・編集・削除・並べ替えできるようにし、プラン1の `items` の API で結合する。

- 各行の「この後にテキストを挿入」と、リストの先頭の「先頭にテキストを挿入」で、その位置に入力欄を開く(Q12)
- 入力欄は複数行のテキストと表示時間(秒、小数第1位まで)。「確定」でリストに入り、「取り消し」で閉じる(Q13)
- 画面でも、サーバーと同じ規則でテキストと表示時間を確かめる。絵文字(絵文字として表示される文字)は画面でも確定の時点で拒否する(B-2)。それ以外のフォントにない文字はサーバーが判定し、結合ボタンを押したときに 422 の理由を表示する(Q5)
- 合計の長さにテキストの場面の表示時間を含める。テキストの場面はアップロードの本数の枠に数えない

## 2. 背景

- プラン1で API は `items` を受け付けるようになったが、画面からは動画しか送れない
- 今の結合リスト(`useMergeQueue`)は `MergeItem` = 動画だけを持ち、削除では必ずサーバーの動画を消す(`deleteVideo`)。テキストの場面はサーバーに保存しないので、削除で API を呼ばない
- アップロードの残りの枠(video-merge の R9)は `mergeCount` = 結合リストの件数で数えている。テキストの場面を数えると、動画100本の枠が減ってしまう(FR-002)
- 動画が100本あると、末尾に足して「上へ」で動かすのは現実的でない(Q12)

## 3. 詳細設計

### 画面の構成(結合の区画)

```
[先頭にテキストを挿入]
1. 📝 2026年10月9日…(3.0秒)    [上へ][下へ][先頭へ][末尾へ][編集][削除]  [この後にテキストを挿入]
2. red.mp4  0:01 / 320x180       [上へ][下へ][先頭へ][末尾へ][削除]        [この後にテキストを挿入]
   ┌ テキスト ─────────────┐ 表示時間 [3.0] 秒   [確定][取り消し]
   │京都 嵐山               │ (2/5行、4/100文字)
   └───────────────────────┘ 1行は20文字までです(1行目が21文字)   ← 確定を押したときの理由
3. blue.mp4 ...
合計 0:05 / 30:00
[結合する]
```

- 入力欄は、挿入なら押した行のすぐ下(先頭なら一覧の上)に、編集ならその行の位置に開く。同時に開ける入力欄は1つだけ。別の入力欄を開こうとしたら、今の入力欄を閉じずにそのボタンを押せなくする
- 入力欄が開いている間は、並べ替えと削除のボタンも押せない(B-3。入力中に並びが変わって、意図と違う位置に入るのを防ぐ)
- 入力中は、行数と文字数(改行を除く)を「2/5行、4/100文字」と表示する
- 「確定」で検証し、だめなら入力欄の下に理由を表示してリストには入れない。表示時間の欄も同じ
- 表示時間の欄の初期値は「3.0」(新規)、または今の値(編集)
- テキストの場面の行は「📝 {1行目}(3.0秒)」。2行以上なら1行目の後に「…」を付ける(Q15)。読み上げ用のラベルは「テキストの場面: {1行目}」。並べ替え・編集・削除のボタンの `aria-label` は「テキストの場面: {1行目} を上へ」などにする
- 結合中は、挿入・編集・削除・並べ替えのボタンをすべて押せない(Q14)
- 入力欄が開いている間は、結合ボタンを押せず「テキストの入力を確定するか取り消してください」と表示する(Q14)
- サーバーが `invalid_text_scene`・`unsupported_characters`・`output_too_small_for_text` を返したら、今の 422 と同じく、ボタンの横にサーバーの `message` を表示する(「2番目のテキストの場面: 表示できない文字が含まれています: 한」)

### 型(`types.ts`)

```ts
export type VideoItem = { kind: "video"; id: string; file_name: string; duration_seconds: number; width: number; height: number };
export type TextSceneItem = { kind: "text"; id: string; text: string; durationTenths: number };
export type MergeItem = VideoItem | TextSceneItem;
```

- テキストの場面の `id` は画面の中だけで使う(React の `key` と編集の対象の指定)。`text-1`、`text-2` … と数える。動画の ID(32桁の16進)とぶつからない
- `text` は正規化済み(`normalizeSceneText` を通したもの)を持つ

### 純粋関数

**`normalizeSceneText.ts`**: サーバーの `normalize_scene_text` と同じ手順(フォントにない文字の判定を除く)
1. `\r\n` を `\n` にそろえる → `normalize("NFC")`
2. 改行以外の制御文字(`\p{Cc}`)・書式文字(`\p{Cf}`)→「表示できない文字が含まれています: タブ」(サーバーと同じ書き方)。**取り除く処理より前に確かめる**ので、先頭・末尾のタブや U+FEFF も拒否される(B-1)
3. 絵文字として表示される文字(`\p{Emoji_Presentation}` と、絵文字の表示を選ぶ U+FE0F)→「表示できない文字が含まれています: 😀」(B-2)。© や ™ のように、文字として表示されるものは拒否しない(フォントにあるかはサーバーが判定する)
4. 前後の「半角空白(U+0020)・全角空白(U+3000)・改行」だけを取り除く(`/^[ \u3000\n]+|[ \u3000\n]+$/g`)。`trim()` は使わない(U+FEFF などまで取り除き、サーバーと取り除く文字が食い違うため。B-1)
5. 空 → 「テキストを入力してください」
6. 6行以上 → 「5行までです(6行あります)」
7. 21文字以上の行 → 「1行は20文字までです(1行目が21文字)」
8. 改行を除いて101文字以上 → 「全体で100文字までです(101文字あります)」
9. 文字数は `[...line].length`(コードポイント数。Q7)
10. 戻り値は `{ ok: true, text, lineCount, charCount } | { ok: false, message }`

絵文字の拒否(手順3)は画面だけの早めの確認で、サーバーではフォントの文字の集合で同じ文字が拒否される。画面とサーバーで拒否する理由の文言は同じになる。

**`parseSceneDuration.ts`**: 表示時間の欄の文字列 → 0.1秒単位の整数
- `^\d{1,2}(\.\d)?$` に合う文字列だけを受け付ける(前後の空白は取り除く)。`"5.5"` → 55、`"3"` → 30、`"60"` → 600、`"1.0"` → 10
- 範囲外(10未満・600超)、数字でない、小数第2位以下がある(`"5.55"`)、指数表記(`"1e1"`)、空 → 「表示時間は1秒から60秒までで、小数第1位まで指定してください」
- 浮動小数を経由しない(`"5.5"` を `5 * 10 + 5` で数える)

**`insertItemAfter.ts`**: 指定の id の項目の後(`null` なら先頭)に項目を入れた新しい配列を返す。指定の id が見つからなければ `null` を返す(B-3。位置を番号ではなく直前の項目の id で持つ)

**`replaceItem.ts`**: 指定の id の項目を置き換えた新しい配列を返す。見つからなければ同じ配列(D-3)

**`sumMergeItemsMilliseconds.ts`**: `MergeItem[]` の合計の長さをミリ秒の整数で返す。動画は今の `sumDurationMilliseconds` と同じ丸め、テキストの場面は `durationTenths * 100` を足す(浮動小数を経由しない。サーバーの `validate_merge_request` と同じ値。D-3)

**`countVideoItems.ts`**: 動画の本数を返す(テキストの場面を数えない。D-3)

**`summarizeSceneText.ts`**: 表示用の1行目と「…」の有無

**`checkMergeable.ts`**(変更): 入力を `{ videoCount, itemCount, totalSeconds, isMerging, isEditing }` にする
- 判定の順: 結合中 > 編集中 > 動画0本「結合するには動画が1本以上必要です」 > 合わせて1つ以下「結合するには動画とテキストの場面を合わせて2つ以上必要です」 > 長さ
- 文言はサーバー(プラン1の表)と同じにする。超過の時間は今の `formatExcess`(秒に切り上げ)で出すので、サーバーの `format_excess` と同じ文言になる(B-8)

**`sumDurationMilliseconds.ts`**: 変更しない。`sumMergeItemsMilliseconds` が動画の分に使う

**`toMergeRequestItems.ts`**: `MergeItem[]` → API の `items`(動画は `{type:"video", video_id}`、テキストの場面は `{type:"text", text, duration_tenths}`)。呼ぶのは `requestMerge.ts` だけ(D-2)

### 状態(`useMergeQueue.ts`)

- `items: MergeItem[]`、`editor: { mode: "insert", afterId: string | null } | { mode: "edit", id } | null`(挿入の位置は直前の項目の id。先頭は `null`。B-3)
- `openInsert(afterId)`、`openEdit(id)`、`closeEditor()`、`confirmText(text, durationTenths)`(`insertItemAfter` または `replaceItem` を呼び、`editor` を閉じる)
  - 挿入の直前の項目が見つからない(入力欄を開く前に始めた動画の削除が完了した、など)ときは、入力欄を閉じずに「挿入する位置の項目がなくなりました。取り消して、もう一度挿入してください」を表示する
- `move`・`removeItem` は、入力欄が開いている間は何もしない(ボタンを押せなくするのに加えて、状態の側でも守る。B-3)
- `removeItem(id)`: テキストの場面なら一覧から外すだけ(API を呼ばない)。動画は今のまま
- `videoCount`(`countVideoItems`)、`totalSeconds`(`sumMergeItemsMilliseconds` / 1000)を返す。API の形(`items`)は返さない(D-2)
- フックの中に計算や配列の組み替えを書かず、上の純粋関数を呼ぶだけにする(D-3)
- 動画の削除の失敗で元の位置に戻す処理(video-merge の I30)は、テキストの場面が混ざっても元の位置に戻ることを確かめる

### 画面の部品

| ファイル | 担当(一文) | 変更 |
|---|---|---|
| `frontend/src/features/merge/types.ts` | 結合リストの項目と応答の型 | `MergeItem` を共用体にする |
| `frontend/src/features/merge/normalizeSceneText.ts` | テキストを正規化して確かめる | 新規 |
| `frontend/src/features/merge/parseSceneDuration.ts` | 表示時間の入力を0.1秒単位の整数にする | 新規 |
| `frontend/src/features/merge/insertItemAfter.ts` | 指定の id の項目の後に項目を入れる | 新規(B-3) |
| `frontend/src/features/merge/replaceItem.ts` | 指定の id の項目を置き換える | 新規(D-3) |
| `frontend/src/features/merge/sumMergeItemsMilliseconds.ts` | 結合リストの合計の長さをミリ秒の整数で返す | 新規(D-3) |
| `frontend/src/features/merge/countVideoItems.ts` | 結合リストの動画の本数を返す | 新規(D-3) |
| `frontend/src/features/merge/summarizeSceneText.ts` | 一覧に出す1行目を作る | 新規 |
| `frontend/src/features/merge/toMergeRequestItems.ts` | 結合リストを API の `items` にする | 新規。`requestMerge.ts` からだけ呼ぶ(D-2) |
| `frontend/src/features/merge/TextSceneEditor.tsx` | テキストと表示時間の入力欄と確定・取り消し | 新規 |
| `frontend/src/features/merge/VideoOrderList.tsx` → `MergeOrderList.tsx` | 結合リストの表示と操作のボタン | 改名し、テキストの場面の行と挿入・編集のボタン、入力欄の差し込みを足す |
| `frontend/src/features/merge/checkMergeable.ts` | 結合できるかと理由を返す | 入力と判定を変える |
| `frontend/src/features/merge/useMergeQueue.ts` | 結合リストの状態と操作 | テキストの場面と入力欄の状態を足す |
| `frontend/src/features/merge/requestMerge.ts` | 結合を依頼する(API の本文の形への変換もここだけで行う) | 引数を `MergeItem[]` にし、中で `toMergeRequestItems` を呼ぶ(プラン1では動画の ID の列を受け取り、中で `items` にしていた。D-2) |
| `frontend/src/features/merge/useMergeJob.ts` | 結合ジョブの開始と問い合わせ | `start` の引数を `MergeItem[]` にし、そのまま `requestMerge` に渡す(変換しない。D-2) |
| `frontend/src/app/App.tsx` | 画面の組み立て | `mergeCount` に `videoCount` を渡す。`mergeJob.start(mergeQueue.items)` を呼ぶ。`MergeOrderList` と新しい `checkMergeable` の入力 |

`TextSceneEditor` の入力欄のラベル: 「テキスト」(`textarea`)、「表示時間(秒)」(`input type="text" inputMode="decimal"`。`type="number"` は「1e1」や小数の丸めをブラウザーが勝手に扱うため使わない)。ボタン: 「確定」「取り消し」。

## 4. テスト影響範囲

| 既存テスト | 影響 |
|---|---|
| `frontend/tests/unit/features/merge/VideoOrderList.test.tsx` | `MergeOrderList.test.tsx` に改名し、動画の行の期待値はそのまま通す |
| `checkMergeable.test.ts` | 入力の形が変わる。既存の期待値(長さの境界、結合中)は保つ。「2本以上の動画が必要です」は新しい文言に変える |
| `useMergeQueue.test.ts` | `addItem` の項目に `kind: "video"` を付ける。期待値は保つ |
| `requestMerge.test.ts`、`useMergeJob.test.ts` | 引数を `MergeItem[]` に変える |
| `frontend/tests/unit/app/App.test.tsx` | 見出しの検証はそのまま通ることを確かめる |
| `useUploadQueue.test.ts` | 影響なし(`mergeCount` の渡し方は App で変える) |
| `e2e/uploadMergeDownload.spec.ts`、`mergeLimits.spec.ts` | 期待値は変えない。ボタンのラベルが変わらないことを確かめる |

E2E の補助として `e2e/support/inspectVideo.ts` に `brightBoundingBox(path, atSeconds)`(明るい画素の外接矩形。プラン1の `bright_bbox` と同じ考え方)を足す。

## 5. 新規テストケース

### フロントエンド単体(`frontend/tests/unit/features/merge/`)

**`normalizeSceneText.test.ts`**(プラン1の `test_normalize_scene_text.py` と同じ入力と期待値にそろえる)
- 「2026年10月9日\n京都 嵐山」→ ok、2行、15文字
- `"京都\r\n嵐山"` → `"京都\n嵐山"`。`"\n　京都 \n\n"` → `"京都"`。`"京都\n\n嵐山"` は3行
- NFD の「か + 濁点」を20個並べた行 → ok(20文字)
- 「𠮷」20個の行 → ok(`length` では40だが、20文字と数える)
- 空・空白だけ → 「テキストを入力してください」
- 5行は ok、6行は「5行までです(6行あります)」
- 20文字は ok、21文字の行は「1行は20文字までです(2行目が21文字)」(超えた行の番号)
- 5行 × 20文字は ok
- タブ → 「表示できない文字が含まれています: タブ」。U+200B → 「…: U+200B」
- 先頭・末尾のタブ(`"\t京都"`、`"京都\t"`)、先頭の U+FEFF、末尾の U+0085 → どれも拒否(取り除かれて受け付けられない。サーバーと同じ。B-1)
- 「京都😀」→「表示できない文字が含まれています: 😀」。「❤️」(U+2764 U+FE0F)も拒否。「©2026」「™」は ok(B-2)

**`parseSceneDuration.test.ts`**
- `"1"` → 10、`"1.0"` → 10、`"5.5"` → 55、`"60"` → 600、`" 3 "` → 30
- `"0.9"`、`"60.1"`、`"61"`、`"5.55"`、`"abc"`、`""`、`"1e1"`、`"-1"`、`"５"`(全角数字)→ エラーの文言

**`insertItemAfter.test.ts`**(B-3)
- [A,B] の先頭(`null`)に T → [T,A,B]、A の後 → [A,T,B]、B の後(末尾)→ [A,B,T]
- 存在しない id の後 → `null`
- 元の配列は変更しない

**`replaceItem.test.ts`**(D-3)
- [A,T1,B] の T1 を T2 に → [A,T2,B]。存在しない id → 同じ並び。元の配列は変更しない

**`sumMergeItemsMilliseconds.test.ts`**(D-3)
- 動画 1.5秒 + テキストの場面 55 → 7000
- 動画 [600.1, 600.2] + テキストの場面 5997 → 1800000(サーバーの `test_validate_merge_request.py` と同じ入力と値)
- 空 → 0

**`countVideoItems.test.ts`**(D-3)
- [テキスト, 動画, テキスト, 動画] → 2。テキストの場面だけ → 0

**`summarizeSceneText.test.ts`**
- 1行 → そのまま、「…」なし。2行 → 1行目と「…」あり

**`toMergeRequestItems.test.ts`**
- [テキスト(30), 動画A, テキスト(55)] → `[{type:"text", text, duration_tenths:30}, {type:"video", video_id:A}, {type:"text", ..., duration_tenths:55}]`

**`checkMergeable.test.ts`**(既存を書き換え・追加)
- 動画1本 + テキストの場面1つ → 結合できる
- 動画1本だけ → 「結合するには動画とテキストの場面を合わせて2つ以上必要です」
- テキストの場面2つだけ → 「結合するには動画が1本以上必要です」
- 入力欄が開いている → 不可で「テキストの入力を確定するか取り消してください」
- 長さ: 動画 1790秒 + テキストの場面 10.0秒は可、10.1秒は不可で超過0.1秒、message は「結合後の長さが30分を1秒超えています」(サーバーと同じ文言。B-8)
- 理由が重なるときは、結合中 > 編集中 > 動画0本 > 合わせて1つ以下 > 長さ の順で1つ

**`useMergeQueue.test.ts`**(追加。`deleteVideo` は差し替える)
- 「先頭にテキストを挿入」→ 確定すると先頭に入る。行1の後に挿入 → 2番目に入る。末尾の行の後にも入る
- 編集で文言と表示時間を変えると、同じ位置のまま置き換わる
- テキストの場面の削除では `deleteVideo` を呼ばない
- テキストの場面の並べ替えが、`items` の順に反映される
- `totalSeconds` は 動画 1.5秒 + テキストの場面 55 で 7.0。`videoCount` はテキストの場面を数えない
- 動画の削除が失敗したとき、テキストの場面が間にあっても元の位置に戻る
- 入力欄が開いている間は、`move`・`removeItem` を呼んでも並びが変わらない(B-3)
- [A,B,C] で B の後に挿入する入力欄を開いている間に、先に始めていた A の削除が失敗して A が元の位置に戻っても、確定すると B の直後に入る(B-3。位置を id で持つ)
- 挿入の直前の項目が、入力中に先に始めていた削除の完了で消えたら、確定しても入らず、入力欄に理由が表示される

**`TextSceneEditor.test.tsx`**
- 表示時間の初期値が「3.0」。編集では今の値
- 入力に応じて「2/5行、4/100文字」が更新される
- 21文字の行で「確定」を押すと理由が表示され、`onConfirm` が呼ばれない
- 「0.9」で「確定」を押すと表示時間の理由が表示される
- 正しい入力で「確定」を押すと、正規化済みのテキストと0.1秒単位の整数で `onConfirm` が呼ばれる
- 「取り消し」で `onCancel` が呼ばれる

**`MergeOrderList.test.tsx`**(既存の `VideoOrderList.test.tsx` を改名して追加)
- テキストの場面の行が「📝 2026年10月9日…(3.0秒)」と表示され、ラベルが「テキストの場面: 2026年10月9日」
- 「先頭にテキストを挿入」と各行の「この後にテキストを挿入」で、入力欄がその位置に開く
- 入力欄が開いている間は、ほかの挿入・編集ボタンに加えて、並べ替えと削除のボタンも押せない(B-3)
- 結合中は、挿入・編集・削除・並べ替えのボタンがすべて押せない
- 動画の行に「編集」ボタンがない

**`requestMerge.test.ts`、`useMergeJob.test.ts`**(書き換え)
- `requestMerge` に `MergeItem[]` を渡すと、本文の `items` に、渡した並び順どおりの動画とテキストの場面が API の形で入る(D-2)
- `useMergeJob.start` は受け取った `MergeItem[]` をそのまま `requestMerge` に渡す
- 422 `unsupported_characters`・`output_too_small_for_text` で、サーバーの `message` を返す

**`frontend/tests/unit/app/App.test.tsx`**(追加)
- テキストの場面を挿入しても、アップロードの残りの枠が減らない(`mergeCount` は動画の本数)

### E2E(`e2e/`。アプリ全体、モックなし)

**`textMerge.spec.ts`**(新規)
- 赤・青をアップロードし、赤の行の「この後にテキストを挿入」で「■」・表示時間「1.0」を確定して結合すると、ダウンロードした動画は:
  - 0.5秒の中央が赤、1.5秒の中央が白・四隅が黒、2.5秒の中央が青(ストーリー1のシナリオ1、SC-001・SC-002)
  - 長さが3秒 ± (1フレーム + 0.03秒)、`decodesToEnd` が成功
- 赤だけをアップロードし、「先頭にテキストを挿入」と赤の行の後にテキストの場面を入れて結合すると、白 → 赤 → 白の順になる(ストーリー1のシナリオ3、SC-007)
- テキストの場面を挿入してから「編集」で表示時間を「2.0」に変え、「上へ」で動かして結合すると、変えた位置・長さ(合計 = 動画 + 2秒 ± 許容)になる(ストーリー3)
- テキストの場面を削除して結合すると、動画だけの長さになる(ストーリー3のシナリオ3)
- 21文字の行を入力して「確定」を押すと理由が表示され、リストに入らない(SC-005)
- 「😀」を含むテキストで「確定」を押すと、入力欄に「表示できない文字が含まれています: 😀」が表示され、リストに入らない(SC-005a、B-2)
- 絵文字ではないがフォントにない文字(ハングルの「한」。実装時にフォントの文字の集合にないことを確かめて選ぶ)を含むテキストは確定でき、結合ボタンを押すと「…番目のテキストの場面: 表示できない文字が含まれています: 한」が表示され、結合が始まらない(サーバー側の判定。SC-005a)
- 赤の後に挿入する入力欄を開いている間は、赤・青の並べ替えと削除のボタンを押せない(B-3)
- 入力欄を開いたままでは結合ボタンを押せない
- 合計が30分を超える組み合わせ(901秒の動画 + 900秒の動画 + テキストの場面 1.0秒 → 30:02)で、超過の表示と結合ボタンの無効化(ストーリー2のシナリオ4、SC-006。既存の `mergeLimits.spec.ts` と同じく低解像度・低 fps の動画で作る)

SC-004(縦長・横長で収まる)と SC-003(長さの精度)は、出力の解像度と fps を自由に作れるプラン1の結合テストで確かめ、E2E では繰り返さない。SC-008(改行を除いて100文字)と SC-009(本数に数えない)は単体テストで確かめる。

## 6. 実装順

| # | タスク | 担当 | 備考 |
|---|---|---|---|
| 1 | 純粋関数(`normalizeSceneText`、`parseSceneDuration`、`insertItemAfter`、`replaceItem`、`sumMergeItemsMilliseconds`、`countVideoItems`、`summarizeSceneText`、`toMergeRequestItems`) | Sonnet のサブエージェント | 仕様と境界値がこのプランとプラン1で確定している。期待値はプラン1の単体テストとそろえる(取り除く文字・拒否する文字・合計の値) |
| 2 | `types.ts` の共用体化、`checkMergeable`、`useMergeQueue`、`requestMerge`、`useMergeJob` | Sonnet のサブエージェント | 既存テストを先に書き換えて Red を確かめてから進める |
| 3 | `TextSceneEditor.tsx`、`MergeOrderList.tsx`(改名を含む)、`App.tsx` | Sonnet のサブエージェント | 入力欄の開閉と、結合中・編集中のボタンの無効化 |
| 4 | E2E の補助 `brightBoundingBox` | Haiku のサブエージェント | 定型作業 |
| 5 | E2E テスト(`textMerge.spec.ts`)と、既存の E2E が通ることの確認 | メイン(Opus) | 画面と API をまたぐ確認。失敗時の原因の切り分けが必要 |
| 6 | サブエージェントの成果の統合と、画面の文言とサーバーの文言の突き合わせ | メイン(Opus) | 同じ入力で画面とサーバーの理由の文言が一致するか |
| 7 | 手動確認: 実際の動画で、見出しの挿入・編集・並べ替えから結合・ダウンロードまでを通し、文字が読めること、入力欄の表示崩れがないことを見る | ユーザー | review.md「静的レビューの限界」 |
| 8 | レビュー | `design-reviewer`、`edge-case-reviewer`、`security-reviewer` を並列 | |

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

- 結合前のテキストの場面のプレビュー(Q16。要件のスコープ外)
- 文字の大きさ・位置・書体・色の選択、フェードなどの演出
- ドラッグ&ドロップでの並べ替え・挿入
- 再読み込み後の結合リスト(テキストの場面を含む)の復元
- 画面でのフォントにない文字の判定(サーバーが判定する。Q5)
- 【要確認】入力欄の Enter キーの扱い: `textarea` の中の Enter は改行にし、確定は「確定」ボタンだけにする想定。Ctrl+Enter で確定できるようにするかは、手動確認(タスク7)のあとで決める

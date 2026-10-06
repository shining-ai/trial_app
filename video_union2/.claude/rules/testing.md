# testing

## 種別と実行コマンド

どのテストも、事前にアプリを起動しなくても1コマンドで実行できる。E2Eは backend と frontend を起動し、healthcheck が通るのを待ってから実行する(終了後もアプリは起動したまま残るので、止めるときは `docker compose down`)。

| 種別 | ツール | 置き場所 | 実行 | 何を守るか |
|---|---|---|---|---|
| 単体(backend) | pytest | `backend/tests/unit/`(`app/` の構造を再現) | `docker compose run --rm --build backend pytest` | 引数の組み立てや入力チェックの境界値と異常系 |
| 結合(backend) | pytest | `backend/tests/integration/` | `docker compose run --rm --build backend pytest` | 本物のFFmpegを使ったAPIの動作 |
| 単体(frontend) | Vitest | `frontend/tests/unit/`(`src/` の構造を再現) | `docker compose run --rm --build frontend npx vitest run` | 並び替えなど画面側のロジック |
| E2E | Playwright | `e2e/` | `docker compose run --rm --build e2e` | アップロードからダウンロードまでの完走 |

- 実行コマンドは `CLAUDE.md` の主要コマンドと同じものを使う。上の表にないコマンドで代用しない
- 単体テストの置き場所は、対象ファイルのパスを再現する
  - 例: `app/features/merge/build_concat_args.py` → `tests/unit/features/merge/test_build_concat_args.py`

## 単体・結合・E2Eの使い分け

**E2Eで検証する:**

- ユーザーの操作の流れが最後まで通ること(アップロード→並び替え→結合→ダウンロード)
- 画面とAPIをまたぐ動作、成功とエラーの表示の切り替わり

**単体で検証する:**

- 外部I/Oのない計算、変換、入力チェック
- E2Eでは網羅しにくい細かい分岐

**結合で検証する:**

- FFmpegやディスクを実際に使うAPIの動作(動画でないファイルの拒否、存在しない動画IDの指定など)

## 骨抜き禁止

- 期待値を固定してassertする。`is not None` や `toBeDefined()` だけで終わらせない
- 常に成功を返すモックを書かない。結合テストとE2Eでは、FFmpegとアプリ内部のAPIをモックしない
- 環境変数やFFmpegの有無を条件にテストをスキップしない。足りなければ失敗させる
- `.only`、`.skip`、`@pytest.mark.skip` を残したままコミットしない
- 新しいテストは、先に失敗(Red)を確認してから実装する

## テストの独立性

- 各テストが自分専用のファイルと保存先を作り、終了時に片付ける
- 他のテストが作ったデータや実行順序に依存しない
- テスト用の動画は、テストのたびにFFmpegの `testsrc` や単色の映像で数秒のものを作る(補助関数 `backend/tests/support/make_video.py`)
- 作れないもの(拡張子だけ動画のテキストファイルなど)だけを `backend/tests/fixtures/` に置き、テスト内で書き換えない
- Playwrightでは `waitForTimeout` で待たず、ロケータの自動待機を使う
- セレクタはrole、label、testidを優先し、CSSクラスに依存しない

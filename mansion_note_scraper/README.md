# マンションノート スクレイパー

[マンションノート](https://www.mansion-note.com/) から賃貸・分譲物件の情報と写真を取得し、CSV に書き出す Docker 対応 CLI ツールです。

---

## ファイル構成

```
mansion_note_scraper/
├── Dockerfile            # python:3.12-slim + Playwright Chromium
├── docker-compose.yml    # volume マウント定義
├── requirements.txt      # Python 依存パッケージ
├── scraper.py            # Playwright 制御・データ抽出・CSV 出力・写真 DL
├── scraper.toml          # 検索条件・実行設定（編集して使う）
├── to_excel.py           # CSV + 写真を Excel (.xlsx) に変換
└── output/               ← 実行結果の出力先（ホストとボリューム共有）
```

---

## 必要環境

- **Docker Desktop** または **Docker Engine + Docker Compose**

---

## セットアップ

```bash
cd mansion_note_scraper

# Docker イメージをビルド（初回のみ、または Dockerfile/requirements.txt 変更時）
docker compose build
```

---

## 使い方

### 1. `scraper.toml` を編集して検索条件を設定する

```toml
type      = "chintai"     # "mansion"（分譲）or "chintai"（賃貸）
area_code = "ct1000525"   # サイトの検索 URL の area=ctXXXXXX から確認

# 賃貸フィルタ
layout    = ["2ldk", "3ldk", "4ldk"]
rent_max  = 25            # 賃料上限（万円）
kanrihi   = true          # 管理費込みで上限適用
area_min  = 55            # 専有面積下限（㎡）
walk_max  = 10            # 徒歩分上限
structure = ["rebar", "steel", "others"]

# 実行設定
max_pages   = 10
page_delay  = 5.0         # 検索結果ページ取得後の待機時間（秒）
unit_delay  = 3.0         # 部屋ページ取得後の待機時間（秒）
photo_delay = 1.5         # 写真 1 枚ごとのダウンロード間隔（秒）
debug       = false       # true にするとスクリーンショットを保存
```

### 2. 実行

スクレイピングから Excel 生成まで一括で行う場合:

```bash
docker compose run --rm run
```

スクレイピングのみ実行する場合:

```bash
docker compose run --rm scraper
```

### CLI オプション（toml の値を上書きしたい場合）

`run` サービスでも同じオプションが使えます。

```bash
# ページ数だけ上書き
docker compose run --rm run --max-pages 3

# デバッグモード（スクリーンショットあり）
docker compose run --rm run --debug

# 前回の実行を再開（output/ 内の最新 run_dir を自動検出）
docker compose run --rm run --resume

# run_dir を明示して再開
docker compose run --rm run --resume /app/output/20260525_010845
```

| オプション | 説明 |
|-----------|------|
| `--config PATH` | 設定ファイルのパスを指定（デフォルト: `/app/scraper.toml`） |
| `--max-pages N` | 最大ページ数を上書き |
| `--debug` | デバッグモードを有効化 |
| `--resume [DIR]` | 前回の実行を再開する。`DIR` 省略時は最新 run_dir を自動検出 |

### 再開の仕組み

WAF ブロック等で中断した場合、`--resume` を付けて再実行すると：

- 既存の `results.csv` から取得済みの `house_id` を読み込む
- 取得済みの部屋はページ遷移せずスキップ
- 写真ディレクトリが既に存在する部屋はダウンロードをスキップ
- CSV は追記モードで続きから書き込む

---

## 時系列比較 Excel

複数回のスクレイピング結果をまとめて、同じ物件の賃料などの推移を比較できます。

```bash
# output/ 内のすべての run_dir を対象に比較
docker compose run --rm compare

# 直近5回分のみ
docker compose run --rm compare --last 5

# 出力ファイルを指定
docker compose run --rm compare --output /app/output/my_comparison.xlsx
```

`output/comparison.xlsx` が生成されます。

### シート構成

| シート | 内容 |
|--------|------|
| 時系列推移 | 物件×日付のマトリクス。賃料の値上がり（赤）・値下がり（緑）・掲載なし（グレー）を色分け |
| 変動サマリー | 新着・消滅・値上がり・値下がりのイベント一覧（実行間の差分） |

### 色の意味（時系列推移シート）

| 色 | 意味 |
|----|------|
| 薄赤 | 前回より賃料が上がった |
| 薄緑 | 前回より賃料が下がった |
| グレー | その回に掲載されていなかった（非掲載期間） |

---

## Excel 変換

スクレイピング後、CSV と写真を Excel (.xlsx) に変換できます。各部屋の全写真を横並びで埋め込みます。

```bash
# 最新の run_dir を自動検出して変換
docker compose run --rm excel

# run_dir を指定する場合
docker compose run --rm excel --run-dir /app/output/20260526_015346
```

`output/{run_dir}/results.xlsx` が生成されます。

### Excel のレイアウト

| 列 | 内容 |
|----|------|
| A〜U列 | 物件データ（21 フィールド） |
| V列以降 | 写真1、写真2、… （各部屋の全写真を横並び） |

- 写真セルのサイズ: 幅 400px × 高さ 450px
- 行の高さはすべての写真セルに合わせて統一
- 1行目は固定（スクロールしてもヘッダーが表示される）
- 写真は元の解像度のまま埋め込み（ファイルサイズは写真数に比例して増加）

> **ファイルサイズの目安**: 95件・写真31列で約 140MB。写真数が多い場合は大きくなります。

---

## 動作フロー

```
scraper.toml を読み込み
    │
    ▼
検索結果ページを巡回（ページネーション対応）
    │
    ├─► 建物カードの「全ての物件を見る」をクリック
    │       └─► モーダルに表示されたユニット一覧を取得
    │           （ボタンなしの場合は建物詳細ページから取得）
    │
    └─► 各ユニットページへ遷移
            ├─► 物件データを抽出して CSV に追記
            └─► 「写真一覧」モーダルを開いて写真を全件ダウンロード
```

---

## 出力

実行するたびに `output/{YYYYMMDD_HHMMSS}/` ディレクトリが作成されます。

```
output/
└── 20260525_120000/
    ├── results.csv               # 物件データ（全ユニット）
    ├── 01_search_p01.png         # デバッグ用スクリーンショット（debug=true 時）
    ├── 02_expand_p01_b01.png
    ├── 03_unit_0001.png
    ├── 04_photos_0001.png
    └── photos/
        ├── グランシャルール武蔵境_1544182706/
        │   ├── 001.jpg
        │   ├── 002.jpg
        │   └── ...
        └── メゾンセルジエ_1540685784/
            ├── 001.jpg
            └── ...
```

### CSV フィールド

| 列名 | 内容 |
|------|------|
| `building_id` | 建物 ID（URL 内の数字） |
| `house_id` | ユニット ID |
| `building_name` | 物件名 |
| `address` | 所在地 |
| `rent` | 賃料 |
| `kanrihi` | 管理費等 |
| `shikikin` | 敷金 |
| `reikin` | 礼金 |
| `layout` | 間取り |
| `area` | 専有面積 |
| `floor` | 所在階 |
| `direction` | 主要採光面（向き） |
| `built_year` | 築年月 |
| `structure` | 建築構造 |
| `total_units` | 総戸数 |
| `station` | 交通（最寄り駅・徒歩分） |
| `notes` | 備考 |
| `position` | 位置 |
| `conditions` | 入居条件 |
| `facilities` | 設備・サービス |
| `url` | ユニットページ URL |

---

## 注意事項

- サイトの利用規約を確認した上でご使用ください
- ページ間には `page_delay` で設定した待機時間を挿入し、サーバー負荷を抑えています
- reCAPTCHA / WAF によるブロックを検出した場合は自動的にスキップします
- サイトの DOM 構造が変更された場合は `scraper.py` のセレクタ更新が必要です

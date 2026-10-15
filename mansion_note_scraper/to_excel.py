"""
CSV + ダウンロード済み写真を Excel (.xlsx) に変換するスクリプト。
各行に全写真を横並びで埋め込む。
labels.json が存在する場合は キッチン・トイレ・浴室 列に振り分ける。

使い方:
    docker compose run --rm excel
    docker compose run --rm excel --run-dir /app/output/20260526_015346
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage

OUTPUT_ROOT = Path("/app/output")

# 写真セルの表示サイズ（ピクセル）
PHOTO_WIDTH_PX  = 400
PHOTO_HEIGHT_PX = 450

# Excel の行の高さ・列幅（400px = 約57文字幅、450px = 約338pt）
ROW_HEIGHT      = 338  # points  (450px ÷ 1.333)
PHOTO_COL_WIDTH = 57   # characters (400px ÷ 7)

HEADER_LABELS = {
    "building_id":   "建物ID",
    "house_id":      "部屋ID",
    "building_name": "物件名",
    "address":       "住所",
    "rent":          "賃料",
    "kanrihi":       "管理費等",
    "shikikin":      "敷金",
    "reikin":        "礼金",
    "layout":        "間取り",
    "area":          "面積",
    "floor":         "所在階",
    "direction":     "向き",
    "built_year":    "築年月",
    "structure":     "構造",
    "total_units":   "総戸数",
    "station":       "交通",
    "notes":         "備考",
    "position":      "位置",
    "conditions":    "入居条件",
    "facilities":    "設備",
    "url":           "URL",
}

# 特定カテゴリ列の定義: (ヘッダー名, ラベルに含まれるキーワードリスト)
SPECIAL_COLUMNS: list[tuple[str, list[str]]] = [
    ("間取り図", ["間取り"]),
    ("キッチン", ["キッチン", "台所", "コンロ"]),
    ("トイレ",   ["トイレ"]),
    ("浴室",     ["浴室", "バスルーム", "バス", "お風呂"]),
    ("洗面台",   ["洗面"]),
]


def _parse_rent(s: str) -> int | str:
    """'21.1万円' → 211000 のように賃料を整数（円）に変換する。"""
    m = re.search(r'([\d.]+)万', s)
    if m:
        return int(float(m.group(1)) * 10000)
    return s


def _parse_kanrihi(s: str) -> int | str:
    """'3,000円' → 3000 のように管理費を整数（円）に変換する。
    'なし' '-' '0円' などは 0 を返す。"""
    cleaned = re.sub(r'[,円\s]', '', s)
    if not cleaned or cleaned in ('-', 'なし', '無料'):
        return 0
    if re.fullmatch(r'\d+', cleaned):
        return int(cleaned)
    return s


def _find_latest_run_dir(output_root: Path) -> Path | None:
    candidates = sorted(
        [d for d in output_root.iterdir() if d.is_dir() and (d / "results.csv").exists()],
        reverse=True,
    )
    return candidates[0] if candidates else None


def _find_photo_dir(photos_dir: Path, house_id: str) -> Path | None:
    """house_id に対応する写真ディレクトリを返す。"""
    if not photos_dir.exists():
        return None
    for d in photos_dir.iterdir():
        if d.is_dir() and d.name.endswith(f"_{house_id}"):
            return d
    return None


def _find_all_photos(photos_dir: Path, house_id: str) -> list[Path]:
    """house_id に対応する全写真を連番順で返す。"""
    d = _find_photo_dir(photos_dir, house_id)
    if d is None:
        return []
    return sorted(
        [p for p in d.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")],
        key=lambda p: p.stem,
    )


def _load_labels(photos_dir: Path, house_id: str) -> dict[str, str]:
    """labels.json を読み込んでファイル名→ラベルの dict を返す。
    ファイルがない場合は空 dict。"""
    d = _find_photo_dir(photos_dir, house_id)
    if d is None:
        return {}
    label_file = d / "labels.json"
    if not label_file.exists():
        return {}
    try:
        return json.loads(label_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _match_special(label: str) -> str | None:
    """ラベルが特定カテゴリのいずれかに一致すれば列名を返す。"""
    for col_name, keywords in SPECIAL_COLUMNS:
        if any(kw in label for kw in keywords):
            return col_name
    return None


def _scale_image(img_path: Path, max_w: int, max_h: int) -> tuple[int, int]:
    """アスペクト比を保ちながら max サイズに収まる表示サイズ (width, height) を返す。"""
    with PILImage.open(img_path) as im:
        orig_w, orig_h = im.size
    ratio = min(max_w / orig_w, max_h / orig_h)
    return int(orig_w * ratio), int(orig_h * ratio)


def _embed_photo(ws, photo_path: Path, cell_addr: str) -> None:
    """写真を指定セルに埋め込む。失敗時はセルに文字を書く。

    直接ファイルパスを XLImage に渡すと、MPO 等の非標準フォーマットを PIL が
    検出した場合に openpyxl が .mpo 拡張子の MIME タイプを解決できず
    KeyError で保存失敗する。PIL 経由で JPEG に正規化してから埋め込む。
    """
    ws[cell_addr].alignment = Alignment(horizontal="center", vertical="center")
    try:
        w, h = _scale_image(photo_path, PHOTO_WIDTH_PX, PHOTO_HEIGHT_PX)
        with PILImage.open(photo_path) as pil_img:
            pil_img = pil_img.convert("RGB")
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG")
            buf.seek(0)
        img = XLImage(buf)
        img.width  = w
        img.height = h
        ws.add_image(img, cell_addr)
    except Exception as e:
        ws[cell_addr] = "読込失敗"
        print(f"  ⚠ 写真埋め込み失敗 ({photo_path.name}): {e}")


def convert(run_dir: Path) -> Path:
    csv_path   = run_dir / "results.csv"
    photos_dir = run_dir / "photos"
    xlsx_path  = run_dir / "results.xlsx"

    if not csv_path.exists():
        print(f"CSV が見つかりません: {csv_path}", file=sys.stderr)
        sys.exit(1)

    # CSV を全件読み込み
    with open(csv_path, encoding="utf-8-sig") as f:
        reader     = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows       = list(reader)

    print(f"変換中: {len(rows)} 件")

    # 各部屋の写真リストとラベルを取得
    photo_lists:  list[list[Path]]       = []
    label_maps:   list[dict[str, str]]   = []
    for row in rows:
        house_id = row.get("house_id", "")
        photos   = _find_all_photos(photos_dir, house_id)
        labels   = _load_labels(photos_dir, house_id)
        photo_lists.append(photos)
        label_maps.append(labels)

    # 各部屋で「特定カテゴリ以外」の写真枚数を数えて最大値を求める
    special_col_names = [c[0] for c in SPECIAL_COLUMNS]
    max_other_photos = 0
    for photos, labels in zip(photo_lists, label_maps):
        other = [p for p in photos if _match_special(labels.get(p.name, "")) is None]
        max_other_photos = max(max_other_photos, len(other))
    print(f"最大写真枚数: 特定カテゴリ {len(SPECIAL_COLUMNS)} 列 + その他 {max_other_photos} 列")

    # ----- Excel シートを構築 -----
    wb = Workbook()
    ws = wb.active
    ws.title = "物件一覧"

    header_fill        = PatternFill("solid", fgColor="1F4E79")
    header_font        = Font(color="FFFFFF", bold=True)
    special_fill       = PatternFill("solid", fgColor="2E75B6")  # 特定カテゴリ列は少し明るい青
    special_font       = Font(color="FFFFFF", bold=True)

    # データ列（A列〜）
    for col_idx, field in enumerate(fieldnames, start=1):
        label = HEADER_LABELS.get(field, field)
        cell  = ws.cell(1, col_idx, label)
        cell.fill      = header_fill
        cell.font      = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        if field == "url":
            ws.column_dimensions[get_column_letter(col_idx)].width = 50
        elif field in ("station", "facilities", "conditions", "notes"):
            ws.column_dimensions[get_column_letter(col_idx)].width = 30
        elif field in ("building_name", "address"):
            ws.column_dimensions[get_column_letter(col_idx)].width = 20
        else:
            ws.column_dimensions[get_column_letter(col_idx)].width = 14

    # 特定カテゴリ列（キッチン・トイレ・浴室）
    special_col_start = len(fieldnames) + 1
    for i, (col_name, _) in enumerate(SPECIAL_COLUMNS):
        col_idx    = special_col_start + i
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = PHOTO_COL_WIDTH
        cell = ws.cell(1, col_idx, col_name)
        cell.fill      = special_fill
        cell.font      = special_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # その他写真列
    other_col_start = special_col_start + len(SPECIAL_COLUMNS)
    for i in range(max_other_photos):
        col_idx    = other_col_start + i
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = PHOTO_COL_WIDTH
        cell = ws.cell(1, col_idx, f"写真{i + 1}")
        cell.fill      = header_fill
        cell.font      = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # データ行
    for row_idx, (row, photos, labels) in enumerate(zip(rows, photo_lists, label_maps), start=2):
        ws.row_dimensions[row_idx].height = ROW_HEIGHT

        # 特定カテゴリ列: キーワードの優先順位に従って最初に一致する写真を埋め込む
        used_photos: set[Path] = set()
        for i, (col_name, keywords) in enumerate(SPECIAL_COLUMNS):
            col_idx   = special_col_start + i
            cell_addr = f"{get_column_letter(col_idx)}{row_idx}"
            matched = None
            for kw in keywords:
                matched = next(
                    (p for p in photos
                     if p not in used_photos
                     and kw in labels.get(p.name, "")),
                    None,
                )
                if matched:
                    break
            if matched:
                used_photos.add(matched)
                _embed_photo(ws, matched, cell_addr)

        # その他写真列: 特定カテゴリに使われなかった写真を順に埋め込む
        other_photos = [p for p in photos if p not in used_photos]
        for j, photo_path in enumerate(other_photos):
            col_idx   = other_col_start + j
            cell_addr = f"{get_column_letter(col_idx)}{row_idx}"
            _embed_photo(ws, photo_path, cell_addr)

        # データを書き込む
        for col_idx, field in enumerate(fieldnames, start=1):
            raw = row.get(field, "")
            if field == "rent":
                value = _parse_rent(raw)
            elif field == "kanrihi":
                value = _parse_kanrihi(raw)
            else:
                value = raw
            cell           = ws.cell(row_idx, col_idx, value)
            cell.alignment = Alignment(vertical="center", wrap_text=True)

        if row_idx % 20 == 0:
            print(f"  {row_idx - 1} 件完了...")

    ws.freeze_panes = "A2"

    wb.save(str(xlsx_path))
    total_photo_cols = len(SPECIAL_COLUMNS) + max_other_photos
    print(f"保存: {xlsx_path}  ({len(rows)} 件, 写真列 {total_photo_cols} 列"
          f" [{'/'.join(special_col_names)} + その他{max_other_photos}])")
    return xlsx_path


def main() -> None:
    parser = argparse.ArgumentParser(description="CSV + 写真 → Excel 変換")
    parser.add_argument(
        "--run-dir", default=None, metavar="DIR",
        help="変換対象の run_dir（省略時は output/ 内の最新を自動検出）",
    )
    args = parser.parse_args()

    if args.run_dir:
        run_dir = Path(args.run_dir)
        if not run_dir.exists():
            print(f"指定された run_dir が存在しません: {run_dir}", file=sys.stderr)
            sys.exit(1)
    else:
        run_dir = _find_latest_run_dir(OUTPUT_ROOT)
        if run_dir is None:
            print("変換できる run_dir が見つかりません。", file=sys.stderr)
            sys.exit(1)

    print(f"対象: {run_dir}")
    convert(run_dir)


if __name__ == "__main__":
    main()

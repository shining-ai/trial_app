"""
マンションノート スクレイパー
ステップ2: 検索結果の全ページを巡回し、各建物ページへ遷移する
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

import tomllib
from playwright.sync_api import sync_playwright, Page

# ----------------------------------------------------------------
# 定数
# ----------------------------------------------------------------

BASE_URL = "https://www.mansion-note.com"
OUTPUT_ROOT = Path("/app/output")
CONFIG_PATH = Path("/app/scraper.toml")

CSV_FIELDS = [
    "building_id", "house_id", "building_name", "address",
    "rent", "kanrihi", "shikikin", "reikin",
    "layout", "area", "floor", "direction",
    "built_year", "structure", "total_units", "station",
    "notes", "position", "conditions", "facilities",
    "url",
]

# 抽出テキストの末尾に付くUIノイズ語句
_NOISE = ["初期費用を知りたい", "部屋の採寸をしたい", "地図を見る", "続きを見る"]

# ----------------------------------------------------------------
# 設定読み込み
# ----------------------------------------------------------------

def load_config(path: Path) -> dict:
    with open(path, "rb") as f:
        return tomllib.load(f)


def build_search_url(cfg: dict) -> str:
    """設定から検索URLを生成する。"""
    prop_type = cfg.get("type", "chintai")
    area_code = cfg.get("area_code", "")

    params: list[str] = [f"area={area_code}"]

    if prop_type == "chintai":
        for layout in cfg.get("layout", []):
            params.append(f"arrangement={layout}")
        if "rent_max" in cfg:
            params.append(f"price_max={int(cfg['rent_max'] * 10000)}")
        if cfg.get("kanrihi"):
            params.append("price_option=kanrihi-kyouekihi-hukumu")
        params.append("s=DEFAULT")
        if "area_min" in cfg:
            params.append(f"size_min={cfg['area_min']}")
        for struct in cfg.get("structure", []):
            params.append(f"structure={struct}")
        if "walk_max" in cfg:
            params.append(f"walk_minutes={cfg['walk_max']}")
        path = "/mansion/chintai/search"
    else:
        if "price_min" in cfg:
            params.append(f"price_min={int(cfg['price_min'] * 10000)}")
        if "price_max" in cfg:
            params.append(f"price_max={int(cfg['price_max'] * 10000)}")
        if "age_max" in cfg:
            params.append(f"age_max={cfg['age_max']}")
        for layout in cfg.get("layout", []):
            params.append(f"arrangement={layout}")
        path = "/mansion/search"

    return f"{BASE_URL}{path}?{'&'.join(params)}"


# ----------------------------------------------------------------
# ブラウザユーティリティ
# ----------------------------------------------------------------

def new_browser_context(playwright) -> tuple:
    """headless Chromium を起動して context と browser を返す。"""
    browser = playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    )
    context = browser.new_context(
        locale="ja-JP",
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 900},
    )
    return browser, context


def save_screenshot(page: Page, label: str, run_dir: Path, full_page: bool = True) -> None:
    """run_dir にスクリーンショットを保存する。失敗してもスキップ。"""
    path = run_dir / f"{label}.png"
    try:
        page.screenshot(path=str(path), full_page=full_page, timeout=30_000)
        print(f"    📸 {path.name}")
    except Exception as e:
        print(f"    ⚠ スクリーンショット失敗: {e}")


def is_waf_blocked(page: Page) -> bool:
    """reCAPTCHA / WAFブロックを検出する。"""
    content = page.content().lower()
    return "recaptcha" in content or (
        page.title() == "" and len(content) < 2000
    )


# ----------------------------------------------------------------
# ページ操作ヘルパー
# ----------------------------------------------------------------

def _wait_for_building_links(page: Page, timeout: int = 15_000) -> None:
    """検索結果ページに建物リンクが現れるまで待つ。"""
    try:
        page.wait_for_function(
            r"() => [...document.querySelectorAll('a[href]')]"
            r".some(a => /^\/mansion\/\d+/.test(a.getAttribute('href') || ''))",
            timeout=timeout,
        )
    except Exception:
        pass


def _wait_for_page_content(page: Page, timeout: int = 15_000) -> None:
    """h1 または main が現れるまで待つ（建物詳細ページ用）。"""
    try:
        page.wait_for_selector("h1, main", timeout=timeout)
    except Exception:
        pass


def _expand_all_units(page: Page) -> None:
    """「すべての物件を見る」ボタンをJSでクリックして全部屋を展開する。"""
    clicked = page.evaluate("""
        () => {
            const all = [...document.querySelectorAll('a, button, span, div')];
            const el = all.find(e => e.textContent.trim().startsWith('すべての物件を見る'));
            if (el) { el.click(); return true; }
            return false;
        }
    """)
    if clicked:
        page.wait_for_timeout(2000)


def _click_building_expand(page: Page, building_href: str) -> bool:
    """検索結果ページ上で特定建物カードの「全ての物件を見る」をクリックする。
    他の建物リンクを含む祖先まで上った時点で探索を打ち切り、誤検出を防ぐ。
    houseId リンクが出現したら True を返す。"""
    bid = re.search(r"/mansion/(\d+)", building_href)
    building_id = bid.group(1) if bid else ""

    clicked = page.evaluate(
        """(href) => {
            const anchor = document.querySelector("a[href='" + href + "']");
            if (!anchor) return false;
            let container = anchor.parentElement;
            while (container && container !== document.body) {
                // この祖先に別の建物リンクが含まれていたら上り過ぎ → 探索終了
                const others = [...container.querySelectorAll('a[href]')].filter(a => {
                    const h = a.getAttribute('href') || '';
                    return h !== href && /^\\/mansion\\/\\d+/.test(h);
                });
                if (others.length > 0) break;

                const els = [...container.querySelectorAll('a, button, span, div')];
                const btn = els.find(e => {
                    const t = e.textContent.trim();
                    return (t.startsWith('全ての物件を見る') || t.startsWith('すべての物件を見る'));
                });
                if (btn) { btn.click(); return true; }
                container = container.parentElement;
            }
            return false;
        }""",
        building_href,
    )
    if not clicked:
        return False

    # モーダル内に /house?houseId= リンクが出現するまで待機
    try:
        page.wait_for_function(
            f"""() => [...document.querySelectorAll('a[href]')]
                .some(a => /\\/mansion\\/{building_id}\\/house\\?houseId=/.test(a.getAttribute('href')||''))""",
            timeout=12_000,
        )
    except Exception:
        page.wait_for_timeout(4000)
    return True


def _open_photo_modal(page: Page) -> tuple[bool, int]:
    """部屋ページの「写真一覧」ボタンをクリックしてモーダルを開く。
    img 数が 10 枚以上増えたらモーダル表示完了と判断して (True, before_count) を返す。
    失敗時は (False, 0) を返す。"""
    before = page.evaluate("() => document.querySelectorAll('img[src]').length")
    clicked = page.evaluate("""
        () => {
            const btn = [...document.querySelectorAll('button')]
                .find(b => b.textContent.trim() === '写真一覧');
            if (btn) { btn.click(); return true; }
            return false;
        }
    """)
    if not clicked:
        return False, 0
    try:
        page.wait_for_function(
            f"() => document.querySelectorAll('img[src]').length > {before + 10}",
            timeout=10_000,
        )
        # モーダルの描画が完了するまで追加待機
        page.wait_for_timeout(800)
    except Exception:
        page.wait_for_timeout(3000)
    return True, before


def _collect_photo_data(page: Page, before_count: int) -> list[dict]:
    """写真モーダルで新たに表示された画像の URL とラベルを収集する。
    img.alt にカテゴリラベル（例: 'キッチン', 'トイレ', '浴室'）が入っている。"""
    return page.evaluate(
        f"""() => {{
            const imgs = [...document.querySelectorAll('img[src]')];
            return imgs
                .slice({before_count})
                .filter(img => !img.src.startsWith('data:'))
                .map(img => ({{
                    src: img.src,
                    label: img.alt.trim(),
                }}));
        }}"""
    )


def _download_photos(photo_data: list[dict], save_dir: Path, delay: float = 1.5) -> int:
    """画像をダウンロードして save_dir に連番保存する。
    labels.json にファイル名→ラベルのマッピングも保存する。成功件数を返す。"""
    import json as _json
    save_dir.mkdir(parents=True, exist_ok=True)
    labels: dict[str, str] = {}
    count = 0
    for i, item in enumerate(photo_data, 1):
        url = item["src"]
        label = item.get("label", "")
        # 拡張子を URL から推測（クエリ除去後）
        base = url.split("?")[0]
        ext = base.rsplit(".", 1)[-1].lower() if "." in base else "jpg"
        if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
            ext = "jpg"
        dest = save_dir / f"{i:03d}.{ext}"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                dest.write_bytes(resp.read())
            labels[dest.name] = label
            count += 1
        except Exception as e:
            print(f"      ⚠ 画像DL失敗[{i}]: {e}")
        if i < len(photo_data):
            time.sleep(delay)
    if labels:
        (save_dir / "labels.json").write_text(
            _json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return count


def _get_modal_unit_hrefs(page: Page, building_id: str) -> list[str]:
    """展開されたモーダル内から特定建物のユニット href を重複なしで収集する。"""
    return page.eval_on_selector_all(
        "a[href]",
        f"""els => {{
            const seen = new Set();
            const result = [];
            for (const el of els) {{
                const href = el.getAttribute('href') || '';
                const m = href.match(/^\\/mansion\\/{building_id}\\/house\\?houseId=(\\d+)/);
                if (m && !seen.has(m[1])) {{
                    seen.add(m[1]);
                    result.push(href);
                }}
            }}
            return result;
        }}""",
    )


def _get_unit_hrefs(page: Page) -> list[str]:
    """建物ページから /mansion/数字/house?houseId=数字 のリンクを収集する。"""
    return page.eval_on_selector_all(
        "a[href]",
        """els => {
            const seen = new Set();
            const result = [];
            for (const el of els) {
                const href = el.getAttribute('href') || '';
                const m = href.match(/^\\/mansion\\/\\d+\\/house\\?houseId=\\d+$/);
                if (m && !seen.has(href)) {
                    seen.add(href);
                    result.push(href);
                }
            }
            return result;
        }""",
    )


def _get_building_hrefs(page: Page) -> list[str]:
    """現在ページから /mansion/数字 のリンクを建物ID単位で重複なしで収集する。"""
    return page.eval_on_selector_all(
        "a[href]",
        """els => {
            const seen = new Set();
            const result = [];
            for (const el of els) {
                const href = el.getAttribute('href') || '';
                const m = href.match(/^\\/mansion\\/(\\d+)/);
                if (m && !seen.has(m[1])) {
                    seen.add(m[1]);
                    result.push(href);
                }
            }
            return result;
        }""",
    )


# ----------------------------------------------------------------
# データ抽出
# ----------------------------------------------------------------

def _clean(s: str) -> str:
    """抽出テキストの末尾UIノイズを除去する。"""
    for noise in _NOISE:
        s = s.replace(noise, "")
    return s.strip()


def _extract_unit_data(page: Page, building_id: str, house_id: str) -> dict:
    """部屋ページから物件データを抽出して dict で返す。"""
    raw: dict = page.evaluate("""
        () => {
            const d = {};
            const txt = el => el ? el.textContent.trim().replace(/\\s+/g, ' ') : '';

            // 建物名: h1
            const h1 = document.querySelector('h1');
            d.building_name = h1 ? txt(h1) : '';

            // TABLE th/td から物件詳細を抽出
            document.querySelectorAll('table tr').forEach(row => {
                const th = row.querySelector('th');
                const td = row.querySelector('td');
                if (!th || !td) return;
                const key = txt(th);
                const val = txt(td);
                if (key === '賃料'            && !d.rent)         d.rent         = val;
                if (key === '管理費等'         && !d.kanrihi)      d.kanrihi      = val;
                if (/^敷金/.test(key)          && !d.shikikin)     d.shikikin     = val;
                if (/^礼金/.test(key)          && !d.reikin)       d.reikin       = val;
                if (key === '交通'             && !d.station)      d.station      = val;
                if (key === '物件名'           && !d.building_name_tbl) d.building_name_tbl = val;
                if (key === '所在地'           && !d.address)      d.address      = val;
                if (key === '間取り'           && !d.layout)       d.layout       = val;
                if (key === '専有面積'         && !d.area)         d.area         = val;
                if (key === '主要採光面'       && !d.direction)    d.direction    = val;
                if (/^所在階/.test(key)        && !d.floor)        d.floor        = val;
                if (key === '築年月'           && !d.built_year)   d.built_year   = val;
                if (key === '総戸数'           && !d.total_units)  d.total_units  = val;
                if (key === '建築構造'         && !d.structure)    d.structure    = val;
            });

            // DL dt/dd から設備・条件情報を抽出
            document.querySelectorAll('dl').forEach(dl => {
                const dts = [...dl.querySelectorAll('dt')];
                const dds = [...dl.querySelectorAll('dd')];
                dts.forEach((dt, i) => {
                    const key = txt(dt);
                    const val = dds[i] ? txt(dds[i]) : '';
                    if (key === '備考'          && !d.notes)      d.notes      = val;
                    if (key === '位置'          && !d.position)   d.position   = val;
                    if (key === '入居条件'      && !d.conditions) d.conditions = val;
                    if (key === '設備・サービス' && !d.facilities) d.facilities = val;
                });
            });

            return d;
        }
    """)

    # テーブルの「物件名」があれば建物名に使う（h1 より正確な場合がある）
    if raw.get("building_name_tbl"):
        raw["building_name"] = raw.pop("building_name_tbl")
    else:
        raw.pop("building_name_tbl", None)

    # UIノイズ除去
    for field in ("rent", "layout", "address", "shikikin", "reikin", "built_year"):
        if raw.get(field):
            raw[field] = _clean(raw[field])

    raw["building_id"] = building_id
    raw["house_id"] = house_id
    raw["url"] = page.url
    return raw


def _matches_criteria(data: dict, cfg: dict) -> bool:
    """建物ページ経由で取得した部屋が検索条件（間取り・面積）を満たすか確認する。"""
    if cfg.get("type", "chintai") != "chintai":
        return True

    # 間取りチェック
    allowed = [l.upper() for l in cfg.get("layout", [])]
    if allowed:
        unit_layout = (data.get("layout") or "").upper()
        if not any(al in unit_layout for al in allowed):
            return False

    # 面積チェック
    area_min = cfg.get("area_min")
    if area_min:
        m = re.search(r"([\d.]+)", data.get("area") or "")
        if not m or float(m.group(1)) < float(area_min):
            return False

    return True


# ----------------------------------------------------------------
# 再開ユーティリティ
# ----------------------------------------------------------------

def _find_latest_run_dir(output_root: Path) -> Path | None:
    """results.csv を持つ最新の run_dir を返す。見つからなければ None。"""
    candidates = sorted(
        [d for d in output_root.iterdir() if d.is_dir() and (d / "results.csv").exists()],
        reverse=True,
    )
    return candidates[0] if candidates else None


def _load_seen_ids(csv_path: Path) -> set[str]:
    """既存 CSV から取得済み house_id を集合で返す。"""
    seen: set[str] = set()
    if not csv_path.exists():
        return seen
    with open(csv_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("house_id"):
                seen.add(row["house_id"])
    return seen


# ----------------------------------------------------------------
# メインスクレイピング
# ----------------------------------------------------------------

def scrape(cfg: dict, run_dir: Path, resume: bool = False) -> None:
    debug: bool = cfg.get("debug", False)
    page_delay: float = cfg.get("page_delay", 5.0)
    unit_delay: float = cfg.get("unit_delay", 3.0)
    photo_delay: float = cfg.get("photo_delay", 1.5)
    max_pages: int = cfg.get("max_pages", 10)
    search_url = build_search_url(cfg)

    print(f"  フィルタURL: {search_url}\n")

    csv_path = run_dir / "results.csv"

    # 再開時: 取得済み house_id を読み込む
    seen_ids: set[str] = _load_seen_ids(csv_path) if resume else set()
    if resume:
        print(f"再開モード: {len(seen_ids)} 件スキップ（取得済み）\n")

    building_total = 0
    unit_total = len(seen_ids)  # スクリーンショット番号を続番にする

    # 再開時はアペンド、新規時はヘッダー付きで新規作成
    csv_mode = "a" if resume else "w"
    write_header = not resume or not csv_path.exists() or csv_path.stat().st_size == 0

    with open(csv_path, csv_mode, newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS, extrasaction="ignore")
        if write_header:
            writer.writeheader()

        with sync_playwright() as pw:
            browser, context = new_browser_context(pw)
            page = context.new_page()

            try:
                # ---------- 1ページ目へ遷移 ----------
                print("検索ページへ遷移中...")
                page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
                _wait_for_building_links(page)

                if is_waf_blocked(page):
                    print("⚠ WAFブロック検出。時間をおいて再試行してください。")
                    if debug:
                        save_screenshot(page, "waf_blocked", run_dir)
                    return

                # ---------- ページネーションループ ----------
                for page_num in range(1, max_pages + 1):

                    # 2ページ目以降はURLで直接移動
                    if page_num > 1:
                        paged_url = f"{search_url}&page={page_num}"
                        print(f"\nページ {page_num} へ移動: {paged_url}")
                        page.goto(paged_url, wait_until="domcontentloaded", timeout=30_000)
                        _wait_for_building_links(page)
                        time.sleep(page_delay)

                        if is_waf_blocked(page):
                            print("⚠ WAFブロック。終了します。")
                            if debug:
                                save_screenshot(page, f"waf_p{page_num:02d}", run_dir)  # noqa: E501
                            break

                    hrefs = _get_building_hrefs(page)
                    if not hrefs:
                        print(f"ページ {page_num}: 物件が見つかりません → 終了")
                        break

                    print(f"ページ {page_num}: {len(hrefs)} 件の建物を検出")
                    if debug:
                        save_screenshot(page, f"01_search_p{page_num:02d}", run_dir)

                    # ---------- 建物ループ ----------
                    for href in hrefs:
                        building_total += 1
                        bm = re.search(r"/mansion/(\d+)", href)
                        building_id = bm.group(1) if bm else href.split("/")[-1]
                        print(f"  [{building_total}] /mansion/{building_id}")

                        # ---------- ユニット href 収集 ----------
                        expanded = _click_building_expand(page, href)
                        filter_units = False
                        if expanded:
                            unit_hrefs = _get_modal_unit_hrefs(page, building_id)
                            print(f"    モーダル展開: {len(unit_hrefs)} 件")
                            if debug:
                                save_screenshot(
                                    page,
                                    f"02_expand_p{page_num:02d}_b{building_total:02d}",
                                    run_dir,
                                    full_page=False,
                                )
                        else:
                            # ボタンなし → まず検索結果ページ全体から building_id で絞る
                            unit_hrefs = _get_modal_unit_hrefs(page, building_id)
                            filter_units = False
                            if unit_hrefs:
                                print(f"    カード直接リンク: {len(unit_hrefs)} 件")
                            else:
                                # ページにリンクがなければ建物詳細ページから取得
                                # （条件不一致の部屋を後でフィルタ）
                                print(f"    「全ての物件を見る」なし → 建物詳細ページから取得")
                                link = page.query_selector(f"a[href='{href}']")
                                if link:
                                    link.click()
                                    _wait_for_page_content(page)
                                    if is_waf_blocked(page):
                                        print(f"    ⚠ WAFブロック → スキップ")
                                        unit_hrefs = []
                                    else:
                                        _expand_all_units(page)
                                        unit_hrefs = _get_unit_hrefs(page)
                                        filter_units = True
                                        print(f"    建物ページ: {len(unit_hrefs)} 件（条件フィルタあり）")
                                else:
                                    print(f"    リンク要素が見つかりません: {href}")
                                    unit_hrefs = []

                        # ---------- 部屋ループ ----------
                        for unit_href in unit_hrefs:
                            unit_url = f"{BASE_URL}{unit_href}"
                            hm = re.search(r"houseId=(\d+)", unit_href)
                            house_id = hm.group(1) if hm else ""

                            # 再開時: 取得済みの部屋はスキップ
                            if house_id and house_id in seen_ids:
                                print(f"    [skip] houseId={house_id} （取得済み）")
                                continue

                            unit_total += 1
                            if not house_id:
                                house_id = str(unit_total)
                            print(f"    [{unit_total}] houseId={house_id} へ遷移...")

                            page.goto(unit_url, wait_until="domcontentloaded", timeout=30_000)
                            _wait_for_page_content(page)

                            if is_waf_blocked(page):
                                print(f"      ⚠ WAFブロック → スキップ")
                            else:
                                unit_title = page.title()
                                print(f"      タイトル: {unit_title[:60]}")
                                data = _extract_unit_data(page, building_id, house_id)
                                print(f"      賃料:{data.get('rent','?')}  間取:{data.get('layout','?')}  面積:{data.get('area','?')}  階:{data.get('floor','?')}")

                                # 建物ページ経由の場合、検索条件に合わない部屋をスキップ
                                if filter_units and not _matches_criteria(data, cfg):
                                    print(f"      条件不一致 → スキップ")
                                    time.sleep(unit_delay)
                                    continue

                                writer.writerow(data)
                                csv_file.flush()
                                if debug:
                                    save_screenshot(page, f"03_unit_{unit_total:04d}", run_dir)

                                # 写真一覧モーダルを開いてキャプチャ・ダウンロード
                                opened, before_count = _open_photo_modal(page)
                                if opened:
                                    photo_data = _collect_photo_data(page, before_count)
                                    print(f"      写真モーダル: 表示 ({len(photo_data)} 枚)")
                                    if debug:
                                        save_screenshot(
                                            page,
                                            f"04_photos_{unit_total:04d}",
                                            run_dir,
                                            full_page=False,
                                        )
                                    if photo_data:
                                        bname = re.sub(r'[\\/:*?"<>|]', '_', data.get("building_name", ""))
                                        photo_dir = run_dir / "photos" / f"{bname}_{house_id}"
                                        if photo_dir.exists() and any(photo_dir.iterdir()):
                                            print(f"      写真DL: スキップ（取得済み）")
                                        else:
                                            dl_count = _download_photos(photo_data, photo_dir, delay=photo_delay)
                                            print(f"      写真DL: {dl_count}/{len(photo_data)} 枚 → {photo_dir.relative_to(run_dir)}")
                                    page.keyboard.press("Escape")
                                else:
                                    print(f"      写真モーダル: ボタンなし")

                            time.sleep(unit_delay)

                        # 検索結果ページへ戻る（モーダルを閉じてリセット）
                        paged_url = search_url if page_num == 1 else f"{search_url}&page={page_num}"
                        page.goto(paged_url, wait_until="domcontentloaded", timeout=30_000)
                        _wait_for_building_links(page)
                        time.sleep(page_delay)

                    # 次ページリンクがなければ最終ページ
                    has_next = page.query_selector("a[rel='next']") is not None
                    if not has_next:
                        print("\n最終ページに達しました。")
                        break

                print(f"\n合計 {building_total} 件の建物、{unit_total} 件の部屋を巡回しました。")

            finally:
                context.close()
                browser.close()

    print(f"CSV: {csv_path}  ({unit_total} 件)")


# ----------------------------------------------------------------
# サマリー表示・エントリポイント
# ----------------------------------------------------------------

def print_config_summary(cfg: dict) -> None:
    prop_type = cfg.get("type", "chintai")
    print("=" * 50)
    print("マンションノート スクレイパー")
    print("=" * 50)
    print(f"種別    : {'賃貸 (chintai)' if prop_type == 'chintai' else '分譲 (mansion)'}")
    print(f"エリア  : コード:{cfg.get('area_code', '未設定')}")

    if prop_type == "chintai":
        layouts = ", ".join(cfg.get("layout", []))
        rent = cfg.get("rent_max")
        kanrihi = cfg.get("kanrihi", False)
        area_min = cfg.get("area_min")
        walk_max = cfg.get("walk_max")
        structure = ", ".join(cfg.get("structure", []))
        if layouts:
            print(f"間取り  : {layouts}")
        if rent:
            suffix = "（共益費・管理費込み）" if kanrihi else ""
            print(f"賃料上限: {rent}万円以下{suffix}")
        if area_min:
            print(f"面積下限: {area_min}㎡以上")
        if walk_max:
            print(f"徒歩上限: {walk_max}分以内")
        if structure:
            print(f"建物構造: {structure}")
    else:
        if "price_min" in cfg:
            print(f"価格下限: {cfg['price_min']}万円")
        if "price_max" in cfg:
            print(f"価格上限: {cfg['price_max']}万円")
        if "age_max" in cfg:
            print(f"築年数  : {cfg['age_max']}年以内")

    print(f"最大ページ: {cfg.get('max_pages', 10)}")
    print(f"ページ間待機: {cfg.get('page_delay', 5.0)}秒")
    print(f"デバッグ: {'有効（スクリーンショット保存）' if cfg.get('debug') else '無効'}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="マンションノート スクレイパー")
    parser.add_argument("--config", default=str(CONFIG_PATH), help="設定ファイルパス")
    parser.add_argument("--debug", action="store_true", default=None,
                        help="デバッグモード（スクリーンショット保存）")
    parser.add_argument("--max-pages", type=int, default=None, help="最大ページ数を上書き")
    parser.add_argument(
        "--resume", nargs="?", const="auto", default=None, metavar="DIR",
        help="前回の実行を再開する。DIR 省略時は output/ 内の最新 run_dir を自動検出",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"設定ファイルが見つかりません: {config_path}", file=sys.stderr)
        sys.exit(1)

    print(f"設定ファイルをロード: {config_path}")
    cfg = load_config(config_path)

    if args.debug is not None:
        cfg["debug"] = args.debug
    if args.max_pages is not None:
        cfg["max_pages"] = args.max_pages

    # --resume の処理
    resume = False
    if args.resume is not None:
        if args.resume == "auto":
            run_dir = _find_latest_run_dir(OUTPUT_ROOT)
            if run_dir is None:
                print("再開できる実行が見つかりません。新規実行します。")
                run_dir = OUTPUT_ROOT / datetime.now().strftime("%Y%m%d_%H%M%S")
                run_dir.mkdir(parents=True, exist_ok=True)
            else:
                resume = True
        else:
            run_dir = Path(args.resume)
            if not run_dir.exists():
                print(f"指定された run_dir が存在しません: {run_dir}", file=sys.stderr)
                sys.exit(1)
            resume = True
    else:
        run_dir = OUTPUT_ROOT / datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir.mkdir(parents=True, exist_ok=True)

    print(f"出力先  : {run_dir}")
    if resume:
        print(f"モード  : 再開\n")
    else:
        print()

    print_config_summary(cfg)
    scrape(cfg, run_dir, resume=resume)


if __name__ == "__main__":
    main()

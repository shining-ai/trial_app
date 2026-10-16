"""
全 run_dir の results.csv を分析し、
「すぐ決まる物件の条件」「お得な物件」を可視化する HTML レポートを生成する。

使い方:
    docker compose run --rm analyze
    docker compose run --rm analyze --output /app/output/analysis.html
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

import plotly.colors as pcolors
import plotly.graph_objects as go
import plotly.io as pio

OUTPUT_ROOT = Path("/app/output")


# ---------------------------------------------------------------------------
# 特徴量抽出
# ---------------------------------------------------------------------------

def _parse_rent(s: str) -> float | None:
    m = re.search(r"([\d.]+)万", s)
    return float(m.group(1)) if m else None


def _parse_kanrihi(s: str) -> float | None:
    cleaned = re.sub(r"[,円\s]", "", s)
    if not cleaned or cleaned in ("-", "なし", "無料"):
        return 0.0
    return float(cleaned) / 10000 if re.fullmatch(r"\d+", cleaned) else None


def _extract_area(s: str) -> float | None:
    m = re.search(r"([\d.]+)\s*[㎡m²]", s)
    return float(m.group(1)) if m else None


def _extract_walk_min(s: str) -> int | None:
    """交通欄から最小徒歩分を抽出する。"""
    mins = [int(m) for m in re.findall(r"徒歩(\d+)分", s)]
    return min(mins) if mins else None


def _extract_age(s: str) -> int | None:
    m = re.search(r"築(\d+)年", s)
    return int(m.group(1)) if m else None


def _extract_layout(s: str) -> str | None:
    """'2LDK（...）' → '2LDK'"""
    m = re.match(r"(\d+[SLDK]+)", s, re.IGNORECASE)
    return m.group(1).upper() if m else None


# ---------------------------------------------------------------------------
# データ読み込み
# ---------------------------------------------------------------------------

def _find_all_run_dirs(output_root: Path) -> list[Path]:
    return sorted(
        d for d in output_root.iterdir()
        if d.is_dir() and (d / "results.csv").exists()
    )


def _load_all_records(run_dirs: list[Path]) -> list[dict]:
    """全 run_dir の CSV を統合し、掲載回数付きレコードを返す。"""
    first_row: dict[str, dict] = {}
    run_counts: dict[str, int] = defaultdict(int)

    for rd in run_dirs:
        with open(rd / "results.csv", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                hid = row.get("house_id", "")
                if not hid:
                    continue
                run_counts[hid] += 1
                if hid not in first_row:
                    first_row[hid] = row

    records = []
    for hid, row in first_row.items():
        rent_val    = _parse_rent(row.get("rent", ""))
        kanrihi_val = _parse_kanrihi(row.get("kanrihi", ""))
        area        = _extract_area(row.get("area", ""))

        if rent_val is None or area is None or area == 0:
            continue

        total_rent = rent_val + (kanrihi_val or 0.0)
        records.append({
            "house_id":    hid,
            "name":        row.get("building_name", ""),
            "url":         row.get("url", ""),
            "run_count":   run_counts[hid],
            "total_rent":  round(total_rent, 2),
            "area":        area,
            "walk_min":    _extract_walk_min(row.get("station", "")),
            "age":         _extract_age(row.get("built_year", "")),
            "layout":      _extract_layout(row.get("layout", "")),
            "rent_per_sqm": round(total_rent / area, 3),
        })

    return records


# ---------------------------------------------------------------------------
# お得スコア（同一間取り内の線形回帰）
# ---------------------------------------------------------------------------

def _linreg(xs: list[float], ys: list[float]) -> tuple[float, float]:
    n = len(xs)
    if n < 2:
        return 0.0, (sum(ys) / n if n else 0.0)
    xm, ym = sum(xs) / n, sum(ys) / n
    num = sum((x - xm) * (y - ym) for x, y in zip(xs, ys))
    den = sum((x - xm) ** 2 for x in xs)
    slope = num / den if den else 0.0
    return slope, ym - slope * xm


def _compute_value_scores(records: list[dict]) -> dict[str, float]:
    """
    同一間取りで 面積→合計賃料 の線形回帰を行い、
    score = (予測賃料 − 実賃料) / 予測賃料 × 100 を返す。
    正が大きいほど「相場より安い（お得）」。
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        if r["layout"]:
            groups[r["layout"]].append(r)

    scores: dict[str, float] = {}
    for group in groups.values():
        if len(group) < 3:
            continue
        xs = [r["area"] for r in group]
        ys = [r["total_rent"] for r in group]
        slope, intercept = _linreg(xs, ys)
        for r in group:
            predicted = slope * r["area"] + intercept
            if predicted > 0:
                scores[r["house_id"]] = round(
                    (predicted - r["total_rent"]) / predicted * 100, 1
                )
    return scores


# ---------------------------------------------------------------------------
# 掲載回数→色
# ---------------------------------------------------------------------------

def _count_color(count: int, min_c: int, max_c: int) -> str:
    if count == 1:
        return "#27ae60"
    if max_c <= 2:
        return "#e74c3c"
    t = (count - 2) / (max_c - 2)
    t = 0.25 + t * 0.75
    return pcolors.sample_colorscale("YlOrRd", [t])[0]


def _count_label(count: int) -> str:
    return "単発（即入居）" if count == 1 else f"{count}回掲載"


# ---------------------------------------------------------------------------
# チャート生成
# ---------------------------------------------------------------------------

def _by_count(records: list[dict], key: str) -> dict[int, list]:
    d: dict[int, list] = defaultdict(list)
    for r in records:
        if r[key] is not None:
            d[r["run_count"]].append(r[key])
    return d


def _chart_scatter_area_rent(records: list[dict]) -> go.Figure:
    """面積 × 合計賃料（掲載回数で色分け）"""
    counts = [r["run_count"] for r in records]
    min_c, max_c = min(counts), max(counts)

    by_count: dict[int, list[dict]] = defaultdict(list)
    for r in records:
        by_count[r["run_count"]].append(r)

    fig = go.Figure()
    for count in sorted(by_count):
        grp = by_count[count]
        fig.add_trace(go.Scatter(
            x=[r["area"] for r in grp],
            y=[r["total_rent"] for r in grp],
            mode="markers",
            name=_count_label(count),
            marker=dict(color=_count_color(count, min_c, max_c),
                        size=8, opacity=0.75,
                        line=dict(color="white", width=0.5)),
            text=[r["name"] for r in grp],
            customdata=[[r["rent_per_sqm"], r["walk_min"] or "-",
                         r["layout"] or "-"] for r in grp],
            hovertemplate=(
                "<b>%{text}</b><br>"
                "面積: %{x}㎡  合計賃料: %{y:.1f}万円<br>"
                "㎡単価: %{customdata[0]:.2f}万円/㎡<br>"
                "徒歩: %{customdata[1]}分  間取り: %{customdata[2]}"
                "<extra></extra>"
            ),
        ))

    fig.update_layout(
        title="面積 × 合計賃料（掲載回数で色分け）",
        xaxis=dict(title="専有面積（㎡）", showgrid=True, gridcolor="#eee"),
        yaxis=dict(title="合計賃料（万円）", ticksuffix="万円",
                   showgrid=True, gridcolor="#eee"),
        plot_bgcolor="white", paper_bgcolor="white",
        legend=dict(title="掲載回数"),
        hovermode="closest",
    )
    return fig


def _chart_box_rent_per_sqm(records: list[dict]) -> go.Figure:
    """㎡単価の分布（掲載回数カテゴリ別）"""
    counts = [r["run_count"] for r in records]
    min_c, max_c = min(counts), max(counts)
    d = _by_count(records, "rent_per_sqm")

    fig = go.Figure()
    for count in sorted(d):
        fig.add_trace(go.Box(
            y=d[count], name=_count_label(count),
            marker_color=_count_color(count, min_c, max_c),
            boxmean=True,
        ))

    fig.update_layout(
        title="㎡単価の比較（掲載回数別）― 即入居物件は安い傾向があるか？",
        yaxis=dict(title="㎡単価（万円/㎡）", ticksuffix="万円",
                   showgrid=True, gridcolor="#eee"),
        xaxis_title="掲載回数",
        plot_bgcolor="white", paper_bgcolor="white", showlegend=False,
    )
    return fig


def _chart_box_walk_min(records: list[dict]) -> go.Figure:
    """最寄り駅 徒歩分の分布（掲載回数別）"""
    counts = [r["run_count"] for r in records]
    min_c, max_c = min(counts), max(counts)
    d = _by_count(records, "walk_min")
    if not d:
        return go.Figure()

    fig = go.Figure()
    for count in sorted(d):
        fig.add_trace(go.Box(
            y=d[count], name=_count_label(count),
            marker_color=_count_color(count, min_c, max_c),
            boxmean=True,
        ))

    fig.update_layout(
        title="最寄り駅 徒歩分の比較（掲載回数別）― 駅近が有利か？",
        yaxis=dict(title="徒歩分", ticksuffix="分",
                   showgrid=True, gridcolor="#eee"),
        xaxis_title="掲載回数",
        plot_bgcolor="white", paper_bgcolor="white", showlegend=False,
    )
    return fig


def _chart_layout_rate(records: list[dict]) -> go.Figure:
    """間取り別の即入居率（件数が3件以上の間取りのみ）"""
    total: dict[str, int] = defaultdict(int)
    single: dict[str, int] = defaultdict(int)
    for r in records:
        layout = r["layout"] or "不明"
        total[layout] += 1
        if r["run_count"] == 1:
            single[layout] += 1

    layouts = sorted(
        [l for l, n in total.items() if n >= 3],
        key=lambda l: single.get(l, 0) / total[l],
        reverse=True,
    )
    if not layouts:
        return go.Figure()

    rates  = [single.get(l, 0) / total[l] * 100 for l in layouts]
    counts = [total[l] for l in layouts]

    fig = go.Figure(go.Bar(
        x=layouts, y=rates,
        text=[f"{r:.0f}%<br>({n}件)" for r, n in zip(rates, counts)],
        textposition="outside",
        marker_color=["#27ae60" if r >= 50 else "#f39c12" if r >= 25 else "#e74c3c"
                      for r in rates],
    ))
    fig.update_layout(
        title="間取り別 即入居率（単発掲載 ÷ 全物件）",
        xaxis_title="間取り",
        yaxis=dict(title="即入居率（%）", ticksuffix="%", range=[0, 115],
                   showgrid=True, gridcolor="#eee"),
        plot_bgcolor="white", paper_bgcolor="white", showlegend=False,
    )
    return fig


def _chart_value_score(records: list[dict], scores: dict[str, float]) -> go.Figure:
    """お得スコア × 合計賃料（右ほど割安、上ほど高額）"""
    if not scores:
        return go.Figure()

    counts = [r["run_count"] for r in records]
    min_c, max_c = min(counts), max(counts)

    by_count: dict[int, list] = defaultdict(list)
    for r in records:
        if r["house_id"] in scores:
            by_count[r["run_count"]].append((r, scores[r["house_id"]]))

    fig = go.Figure()
    for count in sorted(by_count):
        items = by_count[count]
        fig.add_trace(go.Scatter(
            x=[score for _, score in items],
            y=[r["total_rent"] for r, _ in items],
            mode="markers",
            name=_count_label(count),
            marker=dict(color=_count_color(count, min_c, max_c),
                        size=8, opacity=0.75,
                        line=dict(color="white", width=0.5)),
            text=[r["name"] for r, _ in items],
            customdata=[[r["area"], r["layout"] or "-", r["run_count"]]
                        for r, _ in items],
            hovertemplate=(
                "<b>%{text}</b><br>"
                "お得スコア: %{x:.1f}%<br>"
                "合計賃料: %{y:.1f}万円<br>"
                "面積: %{customdata[0]}㎡  間取り: %{customdata[1]}<br>"
                "掲載: %{customdata[2]}回"
                "<extra></extra>"
            ),
        ))

    fig.add_vline(x=0, line_dash="dash", line_color="#aaa")
    fig.add_annotation(x=0, y=1, yref="paper", text="← 割高 | 相場通り | 割安 →",
                       showarrow=False, font=dict(color="#888", size=11),
                       xanchor="center", yanchor="bottom")
    fig.add_annotation(
        x=max(scores.values()) * 0.7 if scores else 10,
        y=max(r["total_rent"] for r in records if r["house_id"] in scores) * 0.95,
        text="右上 → 割安で高価格帯<br>右下 → 割安かつリーズナブル ★狙い目",
        showarrow=False, font=dict(color="#27ae60", size=10),
        bgcolor="rgba(255,255,255,0.85)", bordercolor="#27ae60", borderwidth=1,
    )
    fig.update_layout(
        title="お得スコア（同一間取り内の相場比）× 合計賃料",
        xaxis=dict(title="お得スコア（%）― 正ほど同間取りの相場より安い",
                   showgrid=True, gridcolor="#eee"),
        yaxis=dict(title="合計賃料（万円）", ticksuffix="万円",
                   showgrid=True, gridcolor="#eee"),
        plot_bgcolor="white", paper_bgcolor="white",
        legend=dict(title="掲載回数"), hovermode="closest",
    )
    return fig


def _chart_age_rent(records: list[dict]) -> go.Figure:
    """築年数 × 合計賃料（掲載回数で色分け）"""
    aged = [r for r in records if r["age"] is not None]
    if not aged:
        return go.Figure()

    counts = [r["run_count"] for r in aged]
    min_c, max_c = min(counts), max(counts)

    by_count: dict[int, list[dict]] = defaultdict(list)
    for r in aged:
        by_count[r["run_count"]].append(r)

    fig = go.Figure()
    for count in sorted(by_count):
        grp = by_count[count]
        fig.add_trace(go.Scatter(
            x=[r["age"] for r in grp],
            y=[r["total_rent"] for r in grp],
            mode="markers",
            name=_count_label(count),
            marker=dict(color=_count_color(count, min_c, max_c),
                        size=8, opacity=0.75,
                        line=dict(color="white", width=0.5)),
            text=[r["name"] for r in grp],
            customdata=[[r["area"], r["layout"] or "-"] for r in grp],
            hovertemplate=(
                "<b>%{text}</b><br>"
                "築年数: %{x}年  合計賃料: %{y:.1f}万円<br>"
                "面積: %{customdata[0]}㎡  間取り: %{customdata[1]}"
                "<extra></extra>"
            ),
        ))

    fig.update_layout(
        title="築年数 × 合計賃料（掲載回数で色分け）― 築古物件の価格競争力",
        xaxis=dict(title="築年数（年）", showgrid=True, gridcolor="#eee"),
        yaxis=dict(title="合計賃料（万円）", ticksuffix="万円",
                   showgrid=True, gridcolor="#eee"),
        plot_bgcolor="white", paper_bgcolor="white",
        legend=dict(title="掲載回数"), hovermode="closest",
    )
    return fig


# ---------------------------------------------------------------------------
# サマリー統計
# ---------------------------------------------------------------------------

def _avg(lst: list, key: str) -> float | None:
    vals = [r[key] for r in lst if r[key] is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _summary(records: list[dict]) -> dict:
    single = [r for r in records if r["run_count"] == 1]
    multi  = [r for r in records if r["run_count"] > 1]
    return {
        "total":           len(records),
        "single_count":    len(single),
        "single_rate":     len(single) / len(records) * 100 if records else 0,
        "avg_rent_single": _avg(single, "total_rent"),
        "avg_rent_multi":  _avg(multi,  "total_rent"),
        "avg_sqm_single":  _avg(single, "rent_per_sqm"),
        "avg_sqm_multi":   _avg(multi,  "rent_per_sqm"),
        "avg_walk_single": _avg(single, "walk_min"),
        "avg_walk_multi":  _avg(multi,  "walk_min"),
    }


# ---------------------------------------------------------------------------
# HTML レポート生成
# ---------------------------------------------------------------------------

def _build_report(records: list[dict], html_path: Path) -> None:
    scores = _compute_value_scores(records)
    stats  = _summary(records)

    figures = [
        ("面積 × 賃料",     _chart_scatter_area_rent(records)),
        ("お得スコア",       _chart_value_score(records, scores)),
        ("㎡単価比較",       _chart_box_rent_per_sqm(records)),
        ("徒歩分比較",       _chart_box_walk_min(records)),
        ("間取り別即入居率", _chart_layout_rate(records)),
        ("築年数 × 賃料",   _chart_age_rent(records)),
    ]

    chart_blocks = []
    first = True
    for title, fig in figures:
        if not fig.data:
            continue
        fig.update_layout(autosize=True, height=460,
                          margin=dict(l=60, r=60, t=50, b=60))
        div = pio.to_html(fig, include_plotlyjs=first, full_html=False,
                          config={"responsive": True})
        first = False
        chart_blocks.append(
            f'<section><h2>{title}</h2><div class="chart">{div}</div></section>'
        )

    def _f(v, suffix="", dec=1):
        return f"{v:.{dec}f}{suffix}" if v is not None else "—"

    cards = [
        ("分析物件数",         f"{stats['total']}件",            ""),
        ("即入居率",           f"{stats['single_rate']:.0f}%",   f"{stats['single_count']}件が単発掲載"),
        ("平均合計賃料 即入居", _f(stats['avg_rent_single'],"万円"), ""),
        ("平均合計賃料 複数回", _f(stats['avg_rent_multi'], "万円"), ""),
        ("平均㎡単価 即入居",   _f(stats['avg_sqm_single'],"万円/㎡",2), ""),
        ("平均㎡単価 複数回",   _f(stats['avg_sqm_multi'], "万円/㎡",2), ""),
        ("平均徒歩分 即入居",   _f(stats['avg_walk_single'],"分"), ""),
        ("平均徒歩分 複数回",   _f(stats['avg_walk_multi'], "分"), ""),
    ]
    cards_html = "".join(
        f'<div class="card"><div class="val">{v}</div>'
        f'<div class="sub">{s}</div><div class="lbl">{l}</div></div>'
        for l, v, s in cards
    )

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>物件分析レポート</title>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:"Hiragino Sans","Noto Sans JP",sans-serif;background:#f0f2f5;color:#333}}
header{{background:#1F4E79;color:#fff;padding:14px 24px}}
header h1{{font-size:1.3em;font-weight:bold}}
.cards{{display:flex;flex-wrap:wrap;gap:12px;padding:16px 20px}}
.card{{background:#fff;border-radius:8px;padding:12px 16px;flex:1 1 160px;
       box-shadow:0 1px 4px rgba(0,0,0,.1)}}
.val{{font-size:1.7em;font-weight:bold;color:#1F4E79}}
.sub{{font-size:.8em;color:#888;min-height:1.1em}}
.lbl{{font-size:.8em;color:#555;margin-top:3px}}
section{{background:#fff;border-radius:8px;margin:0 20px 16px;
         box-shadow:0 1px 4px rgba(0,0,0,.1);padding:4px 4px 0}}
section h2{{font-size:1em;color:#1F4E79;padding:10px 12px 4px;display:none}}
.chart{{width:100%}}
</style>
</head>
<body>
<header><h1>物件分析レポート ― すぐ決まる条件・お得な物件</h1></header>
<div class="cards">{cards_html}</div>
{''.join(chart_blocks)}
</body>
</html>"""

    html_path.write_text(html, encoding="utf-8")
    print(f"保存: {html_path}")


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="物件データを分析して HTML レポートを生成")
    parser.add_argument("--output", default=None, metavar="PATH",
                        help="出力 HTML パス（省略時: output/analysis.html）")
    args = parser.parse_args()

    run_dirs = _find_all_run_dirs(OUTPUT_ROOT)
    if not run_dirs:
        print("results.csv を持つ run_dir が見つかりません。", file=sys.stderr)
        sys.exit(1)

    print(f"対象: {len(run_dirs)} 回分")
    records = _load_all_records(run_dirs)
    print(f"物件数: {len(records)} 件")

    html_path = Path(args.output) if args.output else OUTPUT_ROOT / "analysis.html"
    _build_report(records, html_path)


if __name__ == "__main__":
    main()

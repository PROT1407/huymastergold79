#!/usr/bin/env python3
"""Sinh trang HTML tĩnh (crawlable) cho SEO từ dữ liệu JSON.

CHẠY TRƯỚC MỖI LẦN PUSH (routine):   python3 scripts/build-seo.py

- bai/<YYYY-MM-DD>-<slug>.html : nhận định H79 (data/strategies.json),
  bản tin vĩ mô theo ngày (data/macro-news.json), giá vàng trong nước theo ngày
  (data/vn-gold-daily.json). Chỉ hiển thị đúng nội dung có trong JSON.
- bai/index.html (Kho bài viết), sitemap.xml, robots.txt
- Cập nhật canonical/og:url/og:image của trang chính theo BASE_URL,
  khối "Bài viết mới" trên index.html (giữa 2 marker SEO-LATEST).
Idempotent: chạy lại nhiều lần cho cùng dữ liệu → cùng kết quả (bài cũ không còn trong
JSON sẽ bị xoá khỏi bai/ để tránh trang mồ côi).
"""
import html, json, os, re, unicodedata, datetime as dt
from pathlib import Path

# Đổi sang "https://huymastergold79.com.vn/" khi tên miền riêng hoạt động
BASE_URL = "https://prot1407.github.io/huymastergold79/"
SITE = "HuymasterGold79"
AUTHOR = "Ngọc Huy"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "bai"
MAIN_PAGES = ["index.html", "gia-vang.html", "chien-luoc.html", "bieu-do.html", "live.html",
              "tin-tuc.html", "lich-kinh-te.html", "kien-thuc.html", "quy-forex.html",
              "tai-khoan-follow.html", "ve-toi.html", "lien-he.html"]
OLD_BASES = ["https://huymastergold79.com.vn/", "https://prot1407.github.io/huymastergold79/"]
VN = dt.timezone(dt.timedelta(hours=7))
TODAY = dt.datetime.now(VN).date().isoformat()

e = lambda t: html.escape(str(t if t is not None else ""), quote=True)
load = lambda n: json.loads((ROOT / "data" / n).read_text(encoding="utf-8"))

def slug(t):
    t = t.replace("đ", "d").replace("Đ", "D")
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")

def dvn(d):
    y, m, dd = d.split("-"); return f"{dd}/{m}/{y}"

def money(v):  # VND -> "141,3 triệu"
    if v is None: return "—"
    return f"{v/1e6:,.2f}".rstrip("0").rstrip(".").replace(",", "X").replace(".", ",").replace("X", ".") + " triệu"

def chg(v):
    if not v: return '<span class="muted">0</span>'
    c = "up" if v > 0 else "down"
    return f'<span class="badge {c}">{"+" if v > 0 else "−"}{abs(v):,}</span>'.replace(",", ".")

def num(v):
    return f"{v:,}".replace(",", ".") if isinstance(v, int) else e(v)

def src_link(s):
    if not s or not s.get("url"): return e((s or {}).get("name", ""))
    return f'<a href="{e(s["url"])}" target="_blank" rel="noopener nofollow">{e(s.get("name") or s["url"])}</a>'

def ul(items, cls=""):
    items = [i for i in (items or []) if i]
    return f'<ul class="seo-ul {cls}">' + "".join(f"<li>{e(i)}</li>" for i in items) + "</ul>" if items else ""

CSS = """<style>
.seo-art{max-width:880px;margin:22px auto}.seo-art h1{font-size:1.55rem;line-height:1.3;margin:6px 0 10px}
.seo-art .card{margin:14px 0}.seo-art p,.seo-art li{line-height:1.65;overflow-wrap:anywhere}
.seo-ul{padding-left:20px;margin:6px 0}.seo-ul li{margin:5px 0}
.seo-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:.85rem}
.seo-lv{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.seo-lv span{padding:5px 12px;border-radius:999px;font-weight:700;font-size:.88rem}
.seo-lv .s{background:rgba(22,199,132,.15);color:var(--up)}.seo-lv .r{background:rgba(234,57,67,.15);color:var(--down)}
.seo-tbl{width:100%;border-collapse:collapse;font-size:.9rem}.seo-tbl th,.seo-tbl td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}
.seo-tw{overflow-x:auto;max-width:100%}
.seo-list{list-style:none;padding:0;margin:0}.seo-list li{padding:12px 0;border-bottom:1px solid var(--line)}
.seo-list a{color:var(--txt);font-weight:700;text-decoration:none}.seo-list a:hover{color:var(--gold)}
.seo-nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
.seo-bc{font-size:.82rem;overflow-wrap:anywhere}.seo-bc a{color:var(--gold)}
@media(max-width:600px){.seo-art{padding:0 4px}.seo-art h1{font-size:1.25rem}}
</style>"""

KIND = {"nd": ("🎯", "Nhận định H79"), "vm": ("🌐", "Tin vĩ mô"), "gv": ("💰", "Vàng trong nước")}

def page(a, body):
    url = BASE_URL + "bai/" + a["file"]
    ld = {"@context": "https://schema.org", "@type": "NewsArticle", "headline": a["title"][:110],
          "description": a["desc"], "datePublished": a["pub"], "dateModified": a["pub"], "inLanguage": "vi",
          "mainEntityOfPage": url, "url": url, "image": [BASE_URL + "assets/og-image.svg"],
          "author": {"@type": "Person", "name": AUTHOR, "url": BASE_URL + "lien-he.html"},
          "publisher": {"@type": "Organization", "name": SITE, "url": BASE_URL,
                        "logo": {"@type": "ImageObject", "url": BASE_URL + "assets/favicon.svg"}}}
    full = f"{a['title']} | {SITE}"
    icon, kname = KIND[a["kind"]]
    return f"""<!DOCTYPE html>
<html lang="vi" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="../">
<title>{e(full)}</title>
<meta name="description" content="{e(a['desc'])}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="{AUTHOR} – {SITE}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0d1117">
<meta property="og:type" content="article"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="{SITE}">
<meta property="og:title" content="{e(a['title'])}"><meta property="og:description" content="{e(a['desc'])}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE_URL}assets/og-image.svg">
<meta property="article:published_time" content="{a['pub']}"><meta property="article:author" content="{AUTHOR}"><meta property="article:section" content="{kname}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800&display=swap" rel="stylesheet">
<script>document.documentElement.dataset.theme=localStorage.getItem('hmg_theme')||'dark'</script>
<link rel="stylesheet" href="css/site.css?v=20261013c">
{CSS}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body data-page="bai">
<div id="site-header"></div>
<main class="wrap"><article class="seo-art">
<nav class="seo-bc"><a href="index.html">Trang chủ</a> › <a href="bai/index.html">Kho bài viết</a> › {e(kname)}</nav>
<div class="seo-meta" style="margin-top:10px"><span class="badge side">{icon} {e(kname)}</span><time datetime="{a['pub']}">{e(a['when'])}</time><span class="muted">· {AUTHOR} / {SITE}</span></div>
<h1>{e(a['title'])}</h1>
{body}
<p class="muted small" style="margin-top:14px">⚠ Nội dung chỉ mang tính tham khảo, là quan điểm cá nhân, không phải lời khuyên đầu tư.</p>
<div class="seo-nav"><a class="btn" href="bai/index.html">📰 Kho bài viết</a><a class="btn ghost" href="chien-luoc.html">🎯 Chiến lược hôm nay</a><a class="btn ghost" href="gia-vang.html">💰 Giá vàng VN</a><a class="btn ghost" href="lich-kinh-te.html">📅 Lịch kinh tế</a><a class="btn ghost" href="live.html">🔴 Phòng Live</a></div>
</article></main>
<div id="site-footer"></div>
<script src="js/common.js?v=20261013c"></script>
</body>
</html>
"""

def card(h, inner):
    return f'<section class="card"><h2>{h}</h2>{inner}</section>' if inner else ""

TI = {"up": ("🔺", "Tăng"), "down": ("🔻", "Giảm"), "side": ("↔️", "Đi ngang")}
def summary_html(s):
    m = s.get("summary")
    if not m: return ""
    tk = m.get("trend") or s.get("trendType") or "side"; ic, w = TI.get(tk, TI["side"])
    def z(o, c, i, lb):
        if not o or not o.get("zone"): return ""
        return (f'<div class="z {c}">{i} {lb} <b>{e(o["zone"])}</b>' + (f' <span class="k">| SL</span> {e(o["sl"])}' if o.get("sl") else "")
                + (f' <span class="k">| TP</span> {e(o["tp"])}' if o.get("tp") else "") + "</div>")
    return (f'<section class="h79s"><div class="t {e(tk)}">Xu hướng: {ic} {e(m.get("trendText") or w)}</div>'
            + z(m.get("sell"), "sell", "🔴", "BÁN") + z(m.get("buy"), "buy", "🟢", "MUA")
            + (f'<div class="n">⚠️ {e(m["note"])}</div>' if m.get("note") else "")
            + (f'<div class="p">💲 {"✅" if m.get("price") == "spot" else "⚠️"} {e(m["priceNote"])}</div>' if m.get("priceNote") else "")
            + "</section>")

def build_strategies():
    out = []
    for s in load("strategies.json").get("strategies", []):
        if s.get("example") or not s.get("date") or not s.get("title"): continue
        t = s.get("time")
        sid = slug(s.get("session", "")) or "phien"
        f = f"{s['date']}-nhan-dinh-vang-{sid}{'-' + t.replace(':', '') if t else ''}.html"
        tr = {"down": ("down", "Giảm"), "up": ("up", "Tăng")}.get(s.get("trendType"), ("side", "Đi ngang"))
        lv = "".join(f'<span class="s">HT {num(x)}</span>' for x in s.get("support", [])) + \
             "".join(f'<span class="r">KC {num(x)}</span>' for x in s.get("resistance", []))
        body = (card("📊 Xu hướng", f'<p><span class="badge {tr[0]}">{tr[1]}</span> {e(s.get("trend"))}</p>')
                + card("📍 Hỗ trợ / Kháng cự (USD/oz)", f'<div class="seo-lv">{lv}</div>' if lv else "")
                + card("🟢 Vùng mua", ul(s.get("entryZones"))) + card("🔴 Vùng bán", ul(s.get("sellZones")))
                + card("🧭 Kịch bản", ul(s.get("scenarios"))) + card("🌐 Vĩ mô", ul(s.get("macro")))
                + card("🥇 Vàng vật chất", f'<p>{e(s["physicalAdvice"])}</p>' if s.get("physicalAdvice") else "")
                + card("ℹ Nguồn dữ liệu", "".join(f'<p class="small muted">{e(s[k])}</p>' for k in ("dataTime", "notes", "disclaimer") if s.get(k))))
        if s.get("summary"):
            body = summary_html(s) + '<details class="h79more"><summary>Xem thêm: chỉ báo, kịch bản, vĩ mô</summary>' + body + "</details>"
        desc = f"Nhận định vàng {s.get('session','')} {dvn(s['date'])}{' lúc ' + t if t else ''}: " + (s.get("trend") or s["title"])
        out.append(dict(kind="nd", file=f, date=s["date"], sort=s["date"] + (t or "00:00"),
                        title=f"Nhận định vàng {dvn(s['date'])} – {s['title']}",
                        desc=desc[:157].rstrip() + ("…" if len(desc) > 157 else ""),
                        pub=f"{s['date']}T{t or '00:00'}:00+07:00",
                        when=f"{s.get('session','')} · {t + ' ' if t else ''}{dvn(s['date'])} (giờ VN)", body=body))
    return out

def build_macro():
    by = {}
    for it in load("macro-news.json").get("items", []):
        if it.get("date") and it["date"] <= TODAY and it.get("title"):
            by.setdefault(it["date"], []).append(it)
    out = []
    for d, its in by.items():
        its.sort(key=lambda x: x.get("priority", 9))
        body = ""
        for it in its:
            imp = {"tăng": ("up", "Hỗ trợ vàng ↑"), "giảm": ("down", "Áp lực vàng ↓")}.get(it.get("impact"), ("side", "Trung lập"))
            srcs = " · ".join(src_link(it[k]) for k in ("source", "source2") if it.get(k))
            body += (f'<section class="card"><h2>{e(it["title"])}</h2><div class="seo-meta"><span class="badge side">{e(it.get("category",""))}</span>'
                     f'<span class="badge {imp[0]}">{imp[1]}</span>{"<span class=muted>" + e(it["time_vn"]) + "</span>" if it.get("time_vn") else ""}</div>'
                     f'<p>{e(it.get("summary"))}</p>' + (f'<p><b>Tác động tới vàng:</b> {e(it["reason"])}</p>' if it.get("reason") else "")
                     + (f'<p class="small">🔗 Nguồn: {srcs}</p>' if srcs else "") + "</section>")
        lead = its[0]["title"]
        desc = f"Bản tin vĩ mô ảnh hưởng giá vàng ngày {dvn(d)} ({len(its)} tin): " + "; ".join(i["title"] for i in its)
        out.append(dict(kind="vm", file=f"{d}-tin-vi-mo-anh-huong-gia-vang.html", date=d, sort=d + "00:01",
                        title=f"Tin vĩ mô vàng {dvn(d)} – {lead}", desc=desc[:157].rstrip() + "…" if len(desc) > 157 else desc,
                        pub=f"{d}T00:00:00+07:00", when=f"{dvn(d)} (giờ VN)", body=body))
    return out

def build_vngold():
    g = load("vn-gold-daily.json")
    hist = g.get("history", {})
    names = {"SJL1L10": "Vàng miếng SJC 1 lượng", "SJ9999": "Nhẫn SJC 9999"}
    for r in g.get("rows", []):
        names.setdefault(r.get("code"), f"{r.get('brand','')} – {r.get('type','')}")
    days = {}
    for code, arr in hist.items():
        prev = None
        for p in sorted(arr, key=lambda x: x["date"]):
            days.setdefault(p["date"], []).append((code, p, prev)); prev = p
    m = re.match(r"(\d\d:\d\d) (\d{4}-\d\d-\d\d)", g.get("vt_time", ""))
    today_d, today_t = (m.group(2), m.group(1)) if m else (None, None)
    if today_d and g.get("rows"): days.setdefault(today_d, [])
    out = []
    for d, lst in days.items():
        is_cur = d == today_d
        body = ""
        if is_cur and g.get("rows"):
            trs = "".join(f'<tr><td>{e(r.get("brand"))}</td><td>{e(r.get("type"))}</td><td><b>{money(r.get("buy"))}</b></td><td><b>{money(r.get("sell"))}</b></td><td>{chg(r.get("chg_sell"))}</td></tr>' for r in g["rows"])
            body += card(f"🧱 Bảng giá lúc {e(g.get('updated_vn',''))} (đồng/lượng)",
                         f'<div class="seo-tw"><table class="seo-tbl"><tr><th>Thương hiệu</th><th>Loại</th><th>Mua</th><th>Bán</th><th>± bán</th></tr>{trs}</table></div>'
                         f'<p class="small muted">Nguồn: <a href="{e(g.get("sources",{}).get("vang_today","https://www.vang.today/"))}" target="_blank" rel="noopener nofollow">vang.today</a></p>')
        else:
            trs = "".join(f'<tr><td>{e(names.get(c, c))}</td><td><b>{money(p.get("buy"))}</b></td><td><b>{money(p.get("sell"))}</b></td><td>{chg(p["sell"] - pv["sell"]) if pv and p.get("sell") and pv.get("sell") else "—"}</td></tr>' for c, p, pv in lst)
            body += card(f"🧱 Giá chốt ngày {dvn(d)} (đồng/lượng)",
                         f'<div class="seo-tw"><table class="seo-tbl"><tr><th>Loại vàng</th><th>Mua</th><th>Bán</th><th>± bán so với hôm trước</th></tr>{trs}</table></div>'
                         f'<p class="small muted">Nguồn: <a href="{e(g.get("sources",{}).get("vang_today","https://www.vang.today/"))}" target="_blank" rel="noopener nofollow">vang.today</a> (lịch sử giá)</p>')
        if is_cur:
            w = g.get("world") or {}
            if w.get("xau_usd"):
                body += card("🌍 Quy đổi giá thế giới", f'<p>Vàng thế giới <b>{w["xau_usd"]:,.1f} USD/oz</b>'.replace(",", "X").replace(".", ",").replace("X", ".")
                             + f', quy đổi ≈ <b>{money(w.get("vnd_per_luong"))}</b> đồng/lượng; chênh SJC (bán) – thế giới ≈ <b>{money(w.get("gap_sjc_sell"))}</b>.</p><p class="small muted">{e(w.get("note"))}</p>')
            body += card("🧠 Phân tích", ul(g.get("analysis")))
            body += card("🥇 Lời khuyên vàng vật chất", f'<p>{e(g["advice"])}</p>' if g.get("advice") else "")
            pk = g.get("peak")
            if pk: body += card("🏔 " + e(pk.get("label", "Đỉnh")), f'<p>{e(pk.get("note"))}</p><p class="small">🔗 {src_link(pk.get("source"))}</p>')
            refs = "".join(f'<div style="margin:8px 0"><p>🔗 {src_link(r)}</p>{ul(r.get("facts"))}</div>' for r in g.get("refs", []))
            body += card("📰 Tham khảo báo chí", refs)
        sjc = next((p for c, p, _ in lst if c == "SJL1L10"), None)
        if is_cur:
            r0 = next((r for r in g.get("rows", []) if r.get("code") == "SJL1L10"), None)
            if r0: sjc = r0
        price = f"SJC {money(sjc.get('buy'))} – {money(sjc.get('sell'))} đồng/lượng" if sjc else "bảng giá SJC, nhẫn 9999"
        desc = f"Giá vàng trong nước hôm nay {dvn(d)}: {price}." + (" " + g["analysis"][0] if is_cur and g.get("analysis") else " Nhẫn SJC 9999 và biến động so với hôm trước.")
        out.append(dict(kind="gv", file=f"{d}-gia-vang-trong-nuoc.html", date=d, sort=d + (today_t if is_cur else "00:00"),
                        title=f"Giá vàng hôm nay {dvn(d)} – {price}", desc=desc[:157].rstrip() + ("…" if len(desc) > 157 else ""),
                        pub=f"{d}T{today_t}:00+07:00" if is_cur else f"{d}T00:00:00+07:00",
                        when=(f"{g.get('updated_vn','')} (giờ VN)" if is_cur else f"{dvn(d)} (giờ VN)"), body=body))
    return out

def index_page(arts):
    groups = {}
    for a in arts: groups.setdefault(a["date"], []).append(a)
    lis = ""
    for d in sorted(groups, reverse=True):
        lis += f'<h2 style="margin-top:18px">📅 {dvn(d)}</h2><ul class="seo-list">'
        for a in groups[d]:
            ic, kn = KIND[a["kind"]]
            lis += f'<li><span class="badge side">{ic} {kn}</span><br><a href="bai/{a["file"]}">{e(a["title"])}</a><p class="small muted">{e(a["desc"])}</p></li>'
        lis += "</ul>"
    a = dict(kind="nd", file="index.html", title="Kho bài viết – Nhận định vàng, tin vĩ mô, giá vàng trong nước",
             desc=f"Lưu trữ {len(arts)} bài: nhận định vàng H79 theo phiên, bản tin vĩ mô ảnh hưởng vàng và giá vàng SJC trong nước mỗi ngày từ {SITE}.",
             pub=(arts[0]["pub"] if arts else TODAY + "T00:00:00+07:00"), when="Cập nhật mỗi ngày")
    h = page(a, f'<section class="card"><p>Toàn bộ nhận định và bản tin được lưu theo ngày, mới nhất ở trên.</p><div class="chips" style="justify-content:flex-start"><a href="chien-luoc.html">🎯 Chiến lược</a><a href="gia-vang.html">💰 Giá vàng</a><a href="lich-kinh-te.html">📅 Lịch kinh tế</a></div>{lis}</section>')
    h = h.replace('"@type": "NewsArticle"', '"@type": "CollectionPage"').replace('<meta property="og:type" content="article">', '<meta property="og:type" content="website">')
    h = re.sub(r'<nav class="seo-bc">.*?</nav>\n<div class="seo-meta".*?</div>\n', '<nav class="seo-bc"><a href="index.html">Trang chủ</a> › Kho bài viết</nav>\n', h, flags=re.S)
    return h

def fix_main_pages(arts):
    for p in MAIN_PAGES:
        fp = ROOT / p
        if not fp.exists(): continue
        s = o = fp.read_text(encoding="utf-8")
        for ob in OLD_BASES:
            if ob != BASE_URL:
                s = re.sub(r'((?:rel="canonical" href|property="og:(?:url|image)" content)=")' + re.escape(ob), r"\1" + BASE_URL, s)
                s = s.replace(f'"url":"{ob}"', f'"url":"{BASE_URL}"')
        if p == "index.html":
            latest = "".join(f'<li><span class="badge side">{KIND[a["kind"]][0]} {KIND[a["kind"]][1]}</span> <a href="bai/{a["file"]}">{e(a["title"])}</a></li>' for a in arts[:6])
            block = (f'<!-- SEO-LATEST:START (tự sinh bởi scripts/build-seo.py) -->\n<section class="card sec"><h2>📰 Bài viết mới</h2>'
                     f'<ul class="seo-list" style="list-style:none;padding:0;margin:0">{latest}</ul>'
                     f'<p style="margin-top:12px"><a class="btn ghost" href="bai/index.html">Xem kho bài viết →</a></p></section>\n<!-- SEO-LATEST:END -->')
            if "<!-- SEO-LATEST:START" in s:
                s = re.sub(r"<!-- SEO-LATEST:START.*?<!-- SEO-LATEST:END -->", lambda _: block, s, flags=re.S)
            else:
                s = s.replace('<section class="card sec center" id="dang-ky">', block + '\n<section class="card sec center" id="dang-ky">', 1)
        if s != o: fp.write_text(s, encoding="utf-8")

def main():
    arts = build_strategies() + build_macro() + build_vngold()
    seen = set(); arts = [a for a in arts if not (a["file"] in seen or seen.add(a["file"]))]
    arts.sort(key=lambda a: (a["sort"], a["file"]), reverse=True)
    OUT.mkdir(exist_ok=True)
    keep = {"index.html"} | {a["file"] for a in arts}
    for f in OUT.glob("*.html"):
        if f.name not in keep: f.unlink()
    for a in arts:
        fp = OUT / a["file"]; h = page(a, a["body"])
        if not fp.exists() or fp.read_text(encoding="utf-8") != h: fp.write_text(h, encoding="utf-8")
    (OUT / "index.html").write_text(index_page(arts), encoding="utf-8")
    fix_main_pages(arts)
    latest = arts[0]["date"] if arts else TODAY
    urls = [(BASE_URL if p == "index.html" else BASE_URL + p, latest, "daily", "1.0" if p == "index.html" else "0.8") for p in MAIN_PAGES if (ROOT / p).exists()]
    urls.append((BASE_URL + "bai/", latest, "daily", "0.8"))
    urls += [(BASE_URL + "bai/" + a["file"], a["date"], "weekly", "0.6") for a in arts]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
        f"  <url><loc>{u}</loc><lastmod>{d}</lastmod><changefreq>{c}</changefreq><priority>{p}</priority></url>\n" for u, d, c, p in urls) + "</urlset>\n"
    (ROOT / "sitemap.xml").write_text(sm, encoding="utf-8")
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /scripts/\n\nSitemap: {BASE_URL}sitemap.xml\n", encoding="utf-8")
    print(f"build-seo: {len(arts)} bài + bai/index.html, sitemap {len(urls)} URL → {BASE_URL}sitemap.xml")

if __name__ == "__main__":
    main()

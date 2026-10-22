#!/usr/bin/env python3
"""Sinh ảnh xem trước mạng xã hội (og:image, 1200x630 PNG) cho h79gold.com.

Chạy tay (không chạy trong GitHub Action):  python3 scripts/og/gen_og.py [--out-dir .]
Cần: Python 3 + playwright (pip install playwright) + Chrome/Chromium, Pillow.
Font: Be Vietnam Pro (tự dùng file .ttf trong máy nếu có, không thì tải từ Google Fonts).

Sinh ra:
  img/og-h79-v3.png, img/og-h79-en-v3.png      ảnh mặc định (VI / EN)
  img/og/style-a.png (+ -en)                    sáng – trắng vàng
  img/og/style-b.png (+ -en)                    đỏ đen – "trading alert"
  img/og/style-c.png (+ -en)                    tối giản – 1 đường chart vàng
  img/og/thumbs/*.jpg                           ảnh nhỏ 360x189 cho bộ chọn ở /admin/
Đổi bố cục ảnh mặc định thì ĐỔI TÊN FILE (v4, v5…) để Facebook/Zalo lấy ảnh mới,
rồi sửa OG_IMG_VI / OG_IMG_EN trong scripts/build-seo.py và các trang tĩnh.
Thêm kiểu mới: thêm vào STYLES bên dưới + OG_STYLES trong build-seo.py + admin/admin.js.
"""
import argparse, io, os, random, shutil, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = Path("/usr/share/fonts/truetype/sand-box/google/Be Vietnam Pro")
TXT = {
    "vi": {"tag": "Chiến lược vàng<br>mỗi ngày", "sub": "Giá vàng · Nhận định XAUUSD · Live", "alert": "TÍN HIỆU GIAO DỊCH"},
    "en": {"tag": "Daily gold<br>strategy · XAUUSD", "sub": "Trade plans · Macro news · Live", "alert": "TRADING ALERT"},
}

def font_css():
    w = {800: "ExtraBold", 700: "Bold", 600: "SemiBold", 500: "Medium"}
    if (FONT_DIR / "BeVietnamPro-ExtraBold.ttf").exists():
        return "".join(f'@font-face{{font-family:BVP;src:url("file://{FONT_DIR}/BeVietnamPro-{n}.ttf");font-weight:{k}}}' for k, n in w.items())
    return '@import url("https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;600;700;800&display=block");'

def logo(size):
    s = (ROOT / "assets/favicon.svg").read_text(encoding="utf-8")
    return s.replace("<svg ", f'<svg width="{size}" height="{size}" ', 1)

def candles(up="#e7c35a", dn="#7a5a1c", seed=79, n=46):
    random.seed(seed); c = []; p = 300; x = 20
    for _ in range(n):
        o = p; p = p + random.uniform(-22, 14) - 5.5; cl = p
        hi = min(o, cl) - random.uniform(6, 24); lo = max(o, cl) + random.uniform(6, 24)
        col = up if cl < o else dn
        c.append(f'<line x1="{x+9}" y1="{hi:.0f}" x2="{x+9}" y2="{lo:.0f}" stroke="{col}" stroke-width="2"/>'
                 f'<rect x="{x}" y="{min(o,cl):.0f}" width="18" height="{max(abs(o-cl),3):.0f}" fill="{col}" rx="2"/>')
        x += 26
    return "".join(c)

TREND = "M0 560 C200 540 300 500 450 470 S700 380 850 330 S1050 220 1200 160"

def chart_svg(up, dn, line, fill, opacity):
    return (f'<svg class="chart" style="opacity:{opacity}" width="1200" height="630"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{fill}" stop-opacity=".5"/><stop offset="1" stop-color="{fill}" stop-opacity="0"/></linearGradient></defs>'
            f'<g transform="translate(0,150)">{candles(up, dn)}</g><path d="{TREND} L1200 630 L0 630Z" fill="url(#f)"/>'
            f'<path d="{TREND}" stroke="{line}" stroke-width="4" fill="none"/></svg>')

BASE_CSS = """html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{font-family:BVP,sans-serif;position:relative}
.chart{position:absolute;left:0;top:0}
.bar{position:absolute;left:0;right:0;height:8px}
.frame{position:absolute;inset:22px;border-radius:22px}
.wrap{position:absolute;left:0;right:0;top:0;bottom:70px;display:flex;align-items:center;justify-content:center;gap:58px}
.logo{line-height:0;border-radius:62px}
.t{display:flex;flex-direction:column}
.tag{font-weight:800;font-size:76px;line-height:1.08;letter-spacing:-1px}
.sub{font-weight:500;font-size:29px;margin-top:22px}
.dom{position:absolute;left:58px;bottom:54px;font-weight:800;font-size:30px;padding:10px 26px;border-radius:999px}
.dom:before{content:"";display:inline-block;width:12px;height:12px;border-radius:50%;background:#1aa35a;margin-right:12px;vertical-align:middle;box-shadow:0 0 0 4px rgba(26,163,90,.25)}
.up{position:absolute;right:70px;top:58px;font-weight:800;font-size:24px;letter-spacing:1px}
"""

def html_default(t):  # v3: như v2 nhưng bỏ chữ H79GOLD, tagline to + căn giữa cạnh huy hiệu, pill góc dưới trái
    css = BASE_CSS + """body{background:radial-gradient(ellipse 60% 75% at 26% 50%,#3a2a08 0%,#16110a 55%,#08080b 100%)}
.bar{background:linear-gradient(90deg,#8a6212,#fff1b8,#d4a32a,#8a6212)}
.frame{border:1.5px solid rgba(212,163,42,.35)}
.logo{filter:drop-shadow(0 0 40px rgba(240,190,60,.55)) drop-shadow(0 18px 30px rgba(0,0,0,.6))}
.tag{color:#f7edd2;filter:drop-shadow(0 4px 14px rgba(0,0,0,.5))}.tag b{background:linear-gradient(180deg,#fff6cf 0%,#f2cd5c 50%,#c8941f 100%);-webkit-background-clip:text;color:transparent;font-weight:800}
.sub{color:#c9b88c}
.dom{color:#14100a;background:linear-gradient(90deg,#fff1b8,#e3b23c);box-shadow:0 6px 22px rgba(227,178,60,.35)}
.up{color:#3ddc84}"""
    return css, chart_svg("#e7c35a", "#7a5a1c", "#f2cd5c", "#d4a32a", .42), logo(300), gold_second_line(t["tag"]), ""

def gold_second_line(tag):  # dòng 2 của tagline tô vàng
    a, b = tag.split("<br>")
    return f"{a}<br><b>{b}</b>"

def html_a(t):  # sáng – trắng vàng
    css = BASE_CSS + """body{background:radial-gradient(ellipse 70% 80% at 24% 45%,#fffaf0 0%,#f8edd0 55%,#efdcab 100%)}
.bar{background:linear-gradient(90deg,#b8862a,#f6dc8a,#c99a2e,#b8862a)}
.frame{border:1.5px solid rgba(160,118,30,.35)}
.logo{filter:drop-shadow(0 16px 30px rgba(120,84,10,.35)) drop-shadow(0 0 2px rgba(160,118,30,.6))}
.tag{color:#2a1f0a}.tag b{background:linear-gradient(180deg,#d9a52c 0%,#a8761a 60%,#7d5610 100%);-webkit-background-clip:text;color:transparent}
.sub{color:#7a6234}
.dom{color:#f6dc8a;background:#1c160b;box-shadow:0 6px 20px rgba(60,40,0,.25)}
.up{color:#14975a}"""
    return css, chart_svg("#c99a2e", "#e3cf9f", "#c99a2e", "#d4a32a", .30), logo(300), gold_second_line(t["tag"]), ""

def html_b(t):  # đỏ đen – trading alert
    css = BASE_CSS + """body{background:radial-gradient(ellipse 65% 80% at 24% 50%,#3a0b0e 0%,#16080a 55%,#060607 100%)}
.bar{background:repeating-linear-gradient(135deg,#e5313b 0 26px,#111 26px 52px);height:10px}
.frame{border:1.5px solid rgba(229,49,59,.45)}
.logo{filter:drop-shadow(0 0 36px rgba(229,49,59,.45)) drop-shadow(0 18px 30px rgba(0,0,0,.7))}
.tag{color:#fff}.tag b{color:#ffcf4a}
.sub{color:#e6b9b9}
.alert{display:inline-flex;align-self:flex-start;align-items:center;gap:12px;font-weight:800;font-size:22px;letter-spacing:3px;color:#fff;background:#e5313b;padding:8px 18px;border-radius:8px;margin-bottom:22px;box-shadow:0 0 24px rgba(229,49,59,.55)}
.alert i{width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.3)}
.dom{color:#160608;background:linear-gradient(90deg,#ffe08a,#f2b51e);box-shadow:0 6px 22px rgba(229,49,59,.35)}
.up{color:#3ddc84}"""
    return css, chart_svg("#3ddc84", "#e5313b", "#e5313b", "#e5313b", .36), logo(280), gold_second_line(t["tag"]), f'<div class="alert"><i></i>{t["alert"]}</div>'

def html_c(t):  # tối giản – 1 đường chart vàng
    line = "M360 532 C440 530 500 506 580 505 S720 470 810 482 S930 440 990 420 S1100 230 1160 150"
    css = BASE_CSS + """body{background:linear-gradient(160deg,#121318 0%,#0b0c10 60%,#08080a 100%)}
.bar{display:none}
.frame{border:1px solid rgba(255,255,255,.08)}
.logo{filter:drop-shadow(0 0 1.5px rgba(233,193,90,.9)) drop-shadow(0 0 26px rgba(233,193,90,.18)) drop-shadow(0 14px 26px rgba(0,0,0,.7))}
.tag{color:#f2f2f2;font-weight:700}.tag b{color:#e9c15a;font-weight:800}
.sub{color:#9a9ba3}
.dom{color:#e9c15a;background:transparent;border:2px solid #e9c15a;padding:8px 24px}
.up{color:#e9c15a}"""
    svg = (f'<svg class="chart" width="1200" height="630"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9c15a" stop-opacity=".16"/>'
           f'<stop offset="1" stop-color="#e9c15a" stop-opacity="0"/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="6"/></filter>'
           f'<linearGradient id="fx" x1="360" x2="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>'
           f'<mask id="m"><rect width="1200" height="630" fill="url(#fx)"/></mask></defs><g mask="url(#m)">'
           + "".join(f'<line x1="40" x2="1160" y1="{y}" y2="{y}" stroke="rgba(255,255,255,.04)"/>' for y in range(120, 600, 80))
           + f'<path d="{line} L1160 600 L360 600Z" fill="url(#f)"/><path d="{line}" stroke="#e9c15a" stroke-width="8" fill="none" opacity=".45" filter="url(#gl)"/>'
           f'<path d="{line}" stroke="#e9c15a" stroke-width="3.5" fill="none" stroke-linecap="round"/></g><circle cx="1160" cy="150" r="9" fill="#e9c15a"/>'
           f'<circle cx="1160" cy="150" r="20" fill="none" stroke="#e9c15a" stroke-opacity=".35" stroke-width="2"/></svg>')
    return css, svg, logo(240), gold_second_line(t["tag"]), ""

STYLES = {  # file VI (EN thêm -en)
    "img/og-h79-v3.png": html_default,
    "img/og/style-a.png": html_a,
    "img/og/style-b.png": html_b,
    "img/og/style-c.png": html_c,
}

def page(fn, lang):
    t = TXT[lang]; css, svg, lg, tag, pre = fn(t)
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{font_css()}{css}</style></head><body>{svg}'
            f'<div class="bar" style="top:0"></div><div class="bar" style="bottom:0"></div><div class="frame"></div>'
            f'<div class="up">▲ XAU/USD</div><div class="wrap"><div class="logo">{lg}</div>'
            f'<div class="t">{pre}<div class="tag">{tag}</div><div class="sub">{t["sub"]}</div></div></div>'
            f'<div class="dom">h79gold.com</div></body></html>')

KEEP = ["#1aa35a", "#3ddc84", "#e5313b", "#14975a", "#ffffff"]  # màu nhỏ (chấm xanh, ▲) dễ bị mất khi giảm màu

def shrink(png_bytes, out, limit=300 * 1024):
    """PNG ≤ limit: giữ nguyên nếu đủ nhỏ, không thì giảm còn 256 màu (dither) – palette ưu tiên các màu KEEP."""
    from PIL import Image, ImageDraw
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    b = io.BytesIO(); im.save(b, "PNG", optimize=True)
    if b.tell() > limit:
        ext = Image.new("RGB", (im.width, im.height + 8 * len(KEEP))); ext.paste(im)
        d = ImageDraw.Draw(ext)
        for i, c in enumerate(KEEP): d.rectangle([0, im.height + 8 * i, im.width, im.height + 8 * i + 7], fill=c)
        pal = ext.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        q = im.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)
        b = io.BytesIO(); q.save(b, "PNG", optimize=True)
    out.parent.mkdir(parents=True, exist_ok=True); out.write_bytes(b.getvalue())
    if "-en" not in out.name:  # ảnh nhỏ cho bộ chọn ở /admin/
        th = out.parent / "thumbs" / (out.stem + ".jpg") if out.parent.name == "og" else out.parent / "og" / "thumbs" / "default.jpg"
        th.parent.mkdir(parents=True, exist_ok=True); im.resize((360, 189), Image.LANCZOS).save(th, "JPEG", quality=82, optimize=True)
    return b.tell()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out-dir", default=str(ROOT)); ap.add_argument("--only", default="")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    exe = next((p for p in ("google-chrome", "chromium", "chromium-browser") if shutil.which(p)), None)
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path=shutil.which(exe) if exe else None)
        pg = br.new_page(viewport={"width": 1200, "height": 630})
        for rel, fn in STYLES.items():
            if a.only and a.only not in rel: continue
            for lang in ("vi", "en"):
                out = Path(a.out_dir) / (rel if lang == "vi" else rel.replace(".png", "-en.png").replace("og-h79-v3-en", "og-h79-en-v3"))
                tmp = Path(tempfile.gettempdir()) / "h79-og.html"; tmp.write_text(page(fn, lang), encoding="utf-8")
                pg.goto(tmp.as_uri(), wait_until="networkidle"); pg.evaluate("document.fonts.ready")
                n = shrink(pg.screenshot(type="png"), out)
                print(f"{out.relative_to(a.out_dir) if out.is_relative_to(a.out_dir) else out}  {n // 1024} KB")
        br.close()

if __name__ == "__main__":
    main()

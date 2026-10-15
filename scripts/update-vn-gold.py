#!/usr/bin/env python3
"""Cập nhật data/vn-gold-daily.json (Vàng trong nước sáng nay).
Tự động: giá các thương hiệu (SJC/DOJI/BTMC qua webgia.com ← giavang.org ← web chính thức; PNJ/Phú Quý/Mi Hồng từ web chính thức, dự phòng cùng chuỗi) + thay đổi so với hôm qua + lịch sử 30 ngày (giá chốt lưu hằng ngày của H79, data/vn-gold-history.json),
giá thế giới (gold-api.com), tỷ giá USD/VND (open.er-api.com), chênh lệch SJC – thế giới.
Thủ công (giữ nguyên từ file cũ, routine sửa trực tiếp trong JSON): peak, refs, analysis, advice.
Chạy: python3 scripts/update-vn-gold.py"""
import json, os, sys, urllib.request, datetime as dt
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Giá chốt 14/10/2026 có nguồn: Phú Quý – techz.vn 'Giá vàng hôm nay 14/10 chốt phiên'; Mi Hồng – mihong.vn API (thay đổi +200k so với giá trước) khớp baohatinh.vn/giaoducthoidai.vn 14/10
SEED = {'PQHNVM': {'2026-10-14': {'buy': 140300000, 'sell': 143300000}},  # PNJ miếng SJC chốt 14/10 (techz.vn, khớp web PNJ)
        'PQ_SJC': {'2026-10-14': {'buy': 140200000, 'sell': 143300000}}, 'PQ_NHAN': {'2026-10-14': {'buy': 139800000, 'sell': 142800000}},
        'MH_SJC': {'2026-10-14': {'buy': 141300000, 'sell': 142800000}}, 'MH_999': {'2026-10-14': {'buy': 141300000, 'sell': 142800000}}}
OUT = os.path.join(ROOT, 'data', 'vn-gold-daily.json')
HIST = os.path.join(ROOT, 'data', 'vn-gold-history.json')  # giá chốt mỗi ngày theo mã: {code: {date: {buy, sell}}}
VN = ZoneInfo('Asia/Ho_Chi_Minh'); K = 1.20565
UA = {'User-Agent': 'Mozilla/5.0 (compatible; huymastergold79-bot; +https://huymastergold79.com.vn)'}
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
import re, time, html as _h
WG = 'https://webgia.com/gia-vang/'
_last = [0.0]
def fetch(u):  # lịch sự: tối đa vài request/lần chạy, cách nhau ≥2 giây
    w = 2 - (time.time() - _last[0])
    if w > 0: time.sleep(w)
    try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode('utf-8', 'ignore')
    finally: _last[0] = time.time()
def num(x):  # '14.030.000' -> 14030000; ô bị ẩn/chữ ('webgia.com', '-') -> None (không bịa số)
    x = x.strip(); return int(re.sub(r'[.,]', '', x)) if re.fullmatch(r'\d{1,3}(?:[.,]\d{3})+', x) else None
def cells(t):  # dòng ô bảng (td/th) theo thứ tự trên trang
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    return [_h.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', c))).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', t, flags=re.S)]
def stamp(t):
    m = re.search(r'Cập nhật lúc\s*(\d\d:\d\d)(?::\d\d)?\s*(\d\d/\d\d/\d{4})', t); return m.group(1) + ' ' + m.group(2) if m else ''
def pick(cs, path, col=0, per_chi=True):  # tìm lần lượt các nhãn trong path, lấy cặp (mua, bán) thứ col sau nhãn cuối
    i = -1
    for lab in path:
        try: i = cs.index(lab, i + 1)
        except ValueError: return None, None
    v = cs[i + 1 + 2 * col: i + 3 + 2 * col]
    if len(v) < 2: return None, None
    b, s = (num(x) for x in v); k = 10 if per_chi else 1
    b, s = (b * k if b else None), (s * k if s else None)
    ok = lambda x: x is not None and 5e7 < x < 5e8
    return (b if ok(b) else None), (s if ok(s) else None)
# (mã, thương hiệu, loại, nhóm, công ty, trang webgia, đường nhãn, cột)
WROWS = [('SJL1L10', 'SJC', 'Vàng miếng SJC', 'mieng', 'SJC', 'sjc', ['Hồ Chí Minh', 'Vàng SJC 1L, 10L, 1KG'], 0),
         ('DOHNL', 'DOJI Hà Nội', 'Vàng miếng SJC', 'mieng', 'DOJI', 'doji', ['SJC Lẻ'], 0), ('DOHCML', 'DOJI TP.HCM', 'Vàng miếng SJC', 'mieng', 'DOJI', 'doji', ['SJC Lẻ'], 2),
         ('PQHNVM', 'PNJ Hà Nội', 'Vàng miếng SJC', 'mieng', 'PNJ', 'pnj', ['Hà Nội', 'SJC'], 0),
         ('BTSJC', 'Bảo Tín Minh Châu', 'Vàng miếng SJC', 'mieng', 'BTMC', 'bao-tin-minh-chau', ['Vàng SJC', 'Vàng miếng 999.9 (24k)'], 0),
         ('SJ9999', 'SJC', 'Nhẫn tròn 9999', 'nhan', 'SJC', 'sjc', ['Hồ Chí Minh', 'Vàng nhẫn SJC 99,99% 1 chỉ, 2 chỉ, 5 chỉ'], 0),
         ('PQHN24NTT', 'PNJ', 'Nhẫn 24K', 'nhan', 'PNJ', 'pnj', ['Nhẫn Trơn PNJ 999.9'], 0),
         ('BT9999NTT', 'Bảo Tín Minh Châu', 'Nhẫn tròn 9999', 'nhan', 'BTMC', 'bao-tin-minh-chau', ['Nhẫn tròn trơn 999.9 (24k)'], 0),
         ('DOJINHTV', 'DOJI Hà Nội', 'Nhẫn tròn 999 Hưng Thịnh Vượng', 'nhan', 'DOJI', 'doji', ['Nhẫn tròn 999 Hưng Thịnh Vượng'], 0),
         ('PQ_SJC', 'Phú Quý', 'Vàng miếng SJC', 'mieng', 'Phú Quý', 'phu-quy', ['Vàng miếng SJC'], 0),
         ('PQ_NHAN', 'Phú Quý', 'Nhẫn tròn Phú Quý 999.9', 'nhan', 'Phú Quý', 'phu-quy', ['Nhẫn tròn Phú Quý (24K 999.9)'], 0),
         ('MH_SJC', 'Mi Hồng', 'Vàng miếng SJC', 'mieng', 'Mi Hồng', 'mi-hong', ['Vàng miếng SJC'], 0), ('MH_999', 'Mi Hồng', 'Vàng 99,9%', 'nhan', 'Mi Hồng', 'mi-hong', ['Vàng 99,9%'], 0)]
ROWS = [r[:5] for r in WROWS]
WG_ONLY = {'sjc', 'doji', 'bao-tin-minh-chau'}  # SJC/DOJI/BTMC chặn bot -> chỉ đọc webgia.com
# (tên hiển thị, host nhãn, URL web chính thức) — chuỗi nguồn: brand → giavang.org → webgia.com
OFF = {'sjc': ('SJC', 'sjc.com.vn', 'https://sjc.com.vn/'), 'doji': ('DOJI', 'doji.vn', 'https://doji.vn/'),
       'bao-tin-minh-chau': ('Bảo Tín Minh Châu', 'btmc.vn', 'https://btmc.vn/'),
       'pnj': ('PNJ', 'giavang.pnj.com.vn', 'https://giavang.pnj.com.vn/'),
       'phu-quy': ('Phú Quý', 'phuquygroup.vn', 'https://phuquygroup.vn/'), 'mi-hong': ('Mi Hồng', 'mihong.vn', 'https://mihong.vn/')}
GV = 'https://giavang.org/'
def wsrc(page):  # đọc qua webgia (webgia ghi nhận giavang.org lấy từ web chính thức)
    name, host, url = OFF[page]
    return {'src_name': f'{name} ({host}) · qua giavang.org / webgia.com', 'src_url': url, 'src_mode': 'chain',
            'src_brand': name, 'src_host': host,
            'src_via': [{'name': 'giavang.org', 'url': GV}, {'name': 'webgia.com', 'url': WG + page + '/'}]}
def dsrc(page, tm=''):  # đọc trực tiếp web chính thức
    name, host, url = OFF[page]
    return {'src_name': f'{name} ({host}) – trực tiếp', 'src_url': url, 'src_mode': 'direct',
            'src_brand': name, 'src_host': host, 'src_time': tm}
def page_rows(u, want):  # phuquygroup.vn: bảng giá HTML (giá/chỉ) -> {tên: (mua, bán)} đồng/lượng
    t = fetch(u); t = _h.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' | ', re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S))))
    out = {}
    for name in want:
        m = re.search(re.escape(name) + r'[ |]+([\d.,]{9,11})[ |]+([\d.,]{9,11})', t)
        if m:
            b, s = (int(re.sub(r'[.,]', '', x)) * 10 for x in m.groups())
            if 5e7 < b <= s < 5e8: out[name] = (b, s)
    tm = re.search(r'(?:lúc|Cập nhật lúc)\s*(\d\d:\d\d)(?::\d\d)?\s*(\d\d/\d\d/\d{4})', t)
    return out, (tm.group(1) + ' ' + tm.group(2) if tm else '')
def pnj():  # giavang.pnj.com.vn dùng API edge-api.pnj.io; đơn vị nghìn đồng/chỉ
    j = json.load(urllib.request.urlopen(urllib.request.Request('https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00', headers=UA), timeout=20))
    m = {x['masp']: x for x in j['data']}; tm = dt.datetime.now(VN).strftime('%H:%M %d/%m/%Y')
    return {c: {'buy': m[k]['giamua'] * 10000, 'sell': m[k]['giaban'] * 10000, **dsrc('pnj', tm)}
            for c, k in (('PQHNVM', 'SJC'), ('PQHN24NTT', 'N24K')) if k in m and 5e3 < m[k]['giamua'] <= m[k]['giaban'] < 5e4}
def mihong():  # mihong.vn dùng API api.mihong.com; đơn vị đồng/chỉ
    j = json.load(urllib.request.urlopen(urllib.request.Request('https://api.mihong.com/v1/gold-prices?market=domestic', headers={**UA, 'x-market': 'mihong'}), timeout=20))
    m = {x['code']: x for x in j}
    return {c: {'buy': m[k]['buyingPrice'] * 10, 'sell': m[k]['sellingPrice'] * 10, **dsrc('mi-hong', m[k].get('dateTime', ''))}
            for c, k in (('MH_SJC', 'SJC'), ('MH_999', '999')) if k in m and 5e6 < m[k]['buyingPrice'] <= m[k]['sellingPrice'] < 5e7}
def phuquy():
    got, tm = page_rows('https://phuquygroup.vn/', ['Vàng miếng SJC', 'Nhẫn tròn Phú Quý 999.9'])
    return {c: {'buy': got[n][0], 'sell': got[n][1], **dsrc('phu-quy', tm)}
            for c, n in (('PQ_SJC', 'Vàng miếng SJC'), ('PQ_NHAN', 'Nhẫn tròn Phú Quý 999.9')) if n in got}
OFFICIAL = [('PNJ', pnj), ('Mi Hồng', mihong), ('Phú Quý', phuquy)]
OK, FAIL = [], []
def main():
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    off = {}  # PNJ/Mi Hồng/Phú Quý: web chính thức (ưu tiên); thiếu -> webgia.com
    for name, fn in OFFICIAL:
        try: off.update(fn()); OK.append(name)
        except Exception as ex: print('web chính thức lỗi', name, ex); FAIL.append(name)
    need = sorted({r[5] for r in WROWS if r[5] in WG_ONLY or r[0] not in off}, key=[r[5] for r in WROWS].index)
    pages = {}
    for pg in need:  # mỗi trang webgia đọc 1 lần
        try: t = fetch(WG + pg + '/'); pages[pg] = (cells(t), stamp(t))
        except Exception as ex: print('webgia lỗi', pg, ex)
    rows = []
    for c, b, t, g, co, pg, path, col in WROWS:
        if c in off and pg not in WG_ONLY: rows.append({'code': c, 'brand': b, 'type': t, 'group': g, 'co': co, **off[c]}); continue
        bu, se = pick(pages[pg][0], path, col) if pg in pages else (None, None)
        if bu is None or se is None or bu > se: bu = se = None  # không đọc được -> hiển thị '–'
        rows.append({'code': c, 'brand': b, 'type': t, 'group': g, 'co': co, 'buy': bu, 'sell': se, **wsrc(pg), 'src_time': pages.get(pg, ('', ''))[1]})
    today = dt.datetime.now(VN).date().isoformat()
    H = json.load(open(HIST)) if os.path.exists(HIST) else {}
    for c in SEED:  # giá chốt có nguồn thật, chỉ thêm nếu chưa có
        for d0, v in SEED[c].items(): H.setdefault(c, {})[d0] = v
    for r in rows:  # giá hiện tại = chốt tạm của hôm nay; so với ngày giao dịch trước đó đã lưu
        h = H.setdefault(r['code'], {}); r.setdefault('chg_buy', None); r.setdefault('chg_sell', None)
        if r['buy'] is None: continue  # không lưu số không đọc được
        h[today] = {'buy': r['buy'], 'sell': r['sell']}
        prev = sorted(d for d in h if d < today)
        r.setdefault('chg_buy', None); r.setdefault('chg_sell', None)
        if prev:
            pv = h[prev[-1]]; r.update(chg_buy=r['buy'] - pv['buy'], chg_sell=r['sell'] - pv['sell'], prev_date=prev[-1], prev_buy=pv['buy'], prev_sell=pv['sell'])
    hs = H.get('SJL1L10', {})
    def ago(n):  # giá chốt SJC gần nhất <= hôm nay - n ngày (chỉ dữ liệu thật đã lưu)
        lim = (dt.date.fromisoformat(today) - dt.timedelta(days=n)).isoformat(); ks = [d for d in hs if d <= lim]
        return None if not ks or (dt.date.fromisoformat(lim) - dt.date.fromisoformat(max(ks))).days > 3 else {'date': max(ks), **hs[max(ks)]}
    cmp_ = {'d1': ago(1), 'w1': ago(7), 'm1': ago(30)}
    H = {c: dict(sorted(v.items())[-400:]) for c, v in H.items()}
    json.dump(H, open(HIST, 'w'), ensure_ascii=False, indent=1)
    hist = {c: [{'date': d0, **v} for d0, v in sorted(H.get(c, {}).items())[-30:]] for c in ('SJL1L10', 'SJ9999')}  # dữ liệu lưu hằng ngày của H79
    xau = get('https://api.gold-api.com/price/XAU'); fx = get('https://open.er-api.com/v6/latest/USD')
    usdvnd = fx['rates']['VND']; world_vnd = round(xau['price'] * usdvnd * K / 1e5) * 1e5
    sjc = next(r for r in rows if r['code'] == 'SJL1L10'); gap = sjc['sell'] - world_vnd if sjc['sell'] else None
    now = dt.datetime.now(VN)
    out = dict(old)
    out.update({'_ghi_chu': 'Phần giá/lịch sử/world/sjc_compare do scripts/update-vn-gold.py tự sinh. peak/refs/analysis/advice/world_news/quick_advice: sửa tay (chỉ số liệu có nguồn). world_news: mỗi mục {text (1 dòng tiếng Việt), source:{name,url}, intl}; luôn giữ ≥1 nguồn quốc tế (ưu tiên CNBC, rồi Reuters/Kitco/Bloomberg), bài trong ngày, link đã kiểm tra.',
        'updated_vn': now.strftime('%H:%M %d/%m/%Y'), 'price_time': next((r['src_time'] for r in rows if r['code'] == 'SJL1L10'), ''), 'history_note': 'Dữ liệu lưu hằng ngày của H79',
        'rows': rows, 'official_ok': OK, 'official_fail': FAIL, 'history': hist, 'sjc_compare': cmp_, 
        'world': {'xau_usd': xau['price'], 'xau_time_utc': xau['updatedAt'], 'usdvnd': usdvnd, 'fx_time_utc': fx['time_last_update_utc'], 'factor': K, 'vnd_per_luong': world_vnd,
                  'gap_sjc_sell': gap, 'note': 'USD/oz × USD/VND (tỷ giá thị trường open.er-api) × 1,20565; chưa gồm thuế, phí'},
        'sources': {'webgia': 'https://webgia.com/gia-vang/', 'giavang': GV, 'gold_api': 'https://gold-api.com/', 'fx': 'https://open.er-api.com/'}})
    INTL = ('cnbc', 'reuters', 'kitco', 'bloomberg')
    if not any(any(k in ((n.get('source') or {}).get('name', '') + (n.get('source') or {}).get('url', '')).lower() for k in INTL) for n in out.get('world_news', [])):
        print('CẢNH BÁO: world_news chưa có nguồn quốc tế (CNBC/Reuters/Kitco/Bloomberg) – routine cần bổ sung 1 mục.')
    for k in ('vt_time', 'row_sources'): out.pop(k, None)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    for r in rows: print(f"{r['brand']:18} {r['type']:32} {r['buy']} {r['sell']}  [{r['src_name']}]")
    print('TG quy đổi', world_vnd, 'chênh SJC', gap)
if __name__ == '__main__': main()

#!/usr/bin/env python3
"""Cập nhật data/vn-gold-daily.json (Vàng trong nước sáng nay).
Tự động: giá các thương hiệu + thay đổi so với hôm qua + lịch sử 30 ngày (vang.today),
giá thế giới (gold-api.com), tỷ giá USD/VND (open.er-api.com), chênh lệch SJC – thế giới.
Thủ công (giữ nguyên từ file cũ, routine sửa trực tiếp trong JSON): peak, refs, analysis, advice.
Chạy: python3 scripts/update-vn-gold.py"""
import json, os, sys, urllib.request, datetime as dt
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Giá chốt 14/10/2026 có nguồn: Phú Quý – techz.vn 'Giá vàng hôm nay 14/10 chốt phiên'; Mi Hồng – mihong.vn API (thay đổi +200k so với giá trước) khớp baohatinh.vn/giaoducthoidai.vn 14/10
SEED = {'PQHNVM': {'2026-10-14': {'buy': 140300000, 'sell': 143300000}},  # PNJ miếng SJC chốt 14/10 (techz.vn, khớp web PNJ); vang.today PQHNVM lệch mua 139,8
        'PQ_SJC': {'2026-10-14': {'buy': 140200000, 'sell': 143300000}}, 'PQ_NHAN': {'2026-10-14': {'buy': 139800000, 'sell': 142800000}},
        'MH_SJC': {'2026-10-14': {'buy': 141300000, 'sell': 142800000}}, 'MH_999': {'2026-10-14': {'buy': 141300000, 'sell': 142800000}}}
OUT = os.path.join(ROOT, 'data', 'vn-gold-daily.json')
HIST = os.path.join(ROOT, 'data', 'vn-gold-history.json')  # giá chốt mỗi ngày theo mã: {code: {date: {buy, sell}}}
VN = ZoneInfo('Asia/Ho_Chi_Minh'); K = 1.20565
VT = 'https://www.vang.today/api/prices'
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (huymastergold79)'}), timeout=30))
# (mã vang.today, thương hiệu, loại, nhóm, công ty)
ROWS = [('SJL1L10', 'SJC', 'Vàng miếng SJC', 'mieng', 'SJC'), ('DOHNL', 'DOJI Hà Nội', 'Vàng miếng SJC', 'mieng', 'DOJI'), ('DOHCML', 'DOJI TP.HCM', 'Vàng miếng SJC', 'mieng', 'DOJI'),
        ('PQHNVM', 'PNJ Hà Nội', 'Vàng miếng SJC', 'mieng', 'PNJ'), ('BTSJC', 'Bảo Tín Minh Châu', 'Vàng miếng SJC', 'mieng', 'BTMC'),
        ('SJ9999', 'SJC', 'Nhẫn tròn 9999', 'nhan', 'SJC'), ('PQHN24NTT', 'PNJ', 'Nhẫn 24K', 'nhan', 'PNJ'), ('BT9999NTT', 'Bảo Tín Minh Châu', 'Nhẫn tròn 9999', 'nhan', 'BTMC'), ('DOJINHTV', 'DOJI', 'Nhẫn/trang sức 9999 (DOJI Jewelry)', 'nhan', 'DOJI')]
SRC = {'vt': ('vang.today', 'https://www.vang.today/'), 'pnj': ('giavang.pnj.com.vn (chính thức)', 'https://giavang.pnj.com.vn/'), 'mhv': ('mihong.vn (chính thức)', 'https://mihong.vn/'), 'pq': ('phuquygroup.vn (chính thức)', 'https://phuquygroup.vn/'), 'mh': ('webgia.com – Mi Hồng', 'https://webgia.com/gia-vang/mi-hong/')}
import re, html as _h
def page_rows(u, want):  # đọc bảng giá HTML (giá/chỉ) -> {tên: (mua, bán)} theo đồng/lượng; chỉ lấy ô có số thật
    t = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode('utf-8', 'ignore')
    t = _h.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' | ', re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S))))
    out = {}
    for name in want:
        m = re.search(re.escape(name) + r'[ |]+([\d.,]{9,11})[ |]+([\d.,]{9,11})', t)
        if m:
            b, s = (int(re.sub(r'[.,]', '', x)) * 10 for x in m.groups())
            if 5e7 < b <= s < 5e8: out[name] = (b, s)
    tm = re.search(r'(?:lúc|Cập nhật lúc)\s*(\d\d:\d\d)(?::\d\d)?\s*(\d\d/\d\d/\d{4})', t)
    return out, (tm.group(1) + ' ' + tm.group(2) if tm else '')
EXTRA = [('pq', 'https://phuquygroup.vn/', 'Phú Quý', [('PQ_SJC', 'Vàng miếng SJC', 'Vàng miếng SJC', 'mieng'), ('PQ_NHAN', 'Nhẫn tròn Phú Quý 999.9', 'Nhẫn tròn Phú Quý 999.9', 'nhan')]),
         ('mh', 'https://webgia.com/gia-vang/mi-hong/', 'Mi Hồng', [('MH_SJC', 'Vàng miếng SJC', 'Vàng miếng SJC', 'mieng'), ('MH_999', 'Vàng 99,9%', 'Vàng 99,9%', 'nhan')])]
UA = {'User-Agent': 'Mozilla/5.0 (huymastergold79)'}
def pnj():  # giavang.pnj.com.vn dùng API edge-api.pnj.io; đơn vị nghìn đồng/chỉ
    j = json.load(urllib.request.urlopen(urllib.request.Request('https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00', headers=UA), timeout=20))
    m = {x['masp']: x for x in j['data']}; tm = dt.datetime.now(VN).strftime('%H:%M %d/%m/%Y')
    return {c: {'buy': m[k]['giamua'] * 10000, 'sell': m[k]['giaban'] * 10000, 'src': 'pnj', 'src_time': tm} for c, k in (('PQHNVM', 'SJC'), ('PQHN24NTT', 'N24K')) if k in m and 5e3 < m[k]['giamua'] <= m[k]['giaban'] < 5e4}
def mihong():  # mihong.vn dùng API api.mihong.com; đơn vị đồng/chỉ
    j = json.load(urllib.request.urlopen(urllib.request.Request('https://api.mihong.com/v1/gold-prices?market=domestic', headers={**UA, 'x-market': 'mihong'}), timeout=20))
    m = {x['code']: x for x in j}
    return {c: {'buy': m[k]['buyingPrice'] * 10, 'sell': m[k]['sellingPrice'] * 10, 'src': 'mhv', 'src_time': m[k].get('dateTime', '')} for c, k in (('MH_SJC', 'SJC'), ('MH_999', '999')) if k in m and 5e6 < m[k]['buyingPrice'] <= m[k]['sellingPrice'] < 5e7}
def blocked(u):
    def f():
        urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=15).read(); raise RuntimeError('chưa có bảng giá đọc được (chặn bot / trang JS)')
    return f
# SJC (Cloudflare 403), DOJI (403), BTMC (không kết nối) – thử mỗi lần, lỗi thì dùng vang.today
OFFICIAL = [('PNJ', pnj), ('Mi Hồng', mihong), ('SJC', blocked('https://sjc.com.vn/')), ('DOJI', blocked('https://giavang.doji.vn/')), ('BTMC', blocked('https://btmc.vn/'))]
OK, FAIL = [], []
def main():
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    cur = get(VT)
    if not cur.get('success'): sys.exit('vang.today lỗi – giữ file cũ')
    P = cur['prices']
    vt = {c: {'code': c, 'brand': b, 'type': t, 'group': g, 'buy': P[c]['buy'], 'sell': P[c]['sell'], 'co': co, 'src': 'vt', 'src_time': f"{cur['time']} {cur['date']}"} for c, b, t, g, co in ROWS if c in P and P[c].get('sell')}
    off = {}  # giá từ website chính thức của từng thương hiệu (ưu tiên); lỗi -> dùng vang.today/webgia
    for name, fn in OFFICIAL:
        try: off.update(fn()); OK.append(name)
        except Exception as ex: print('web chính thức lỗi', name, ex); FAIL.append(name)
    rows = []
    for c, b, t, g, co in ROWS:
        if c in off: rows.append({'code': c, 'brand': b, 'type': t, 'group': g, 'co': co, **off[c]})
        elif c in vt: rows.append(vt[c])
    for key, url, co, items in EXTRA:  # Phú Quý (web chính thức), Mi Hồng (web chính thức, dự phòng webgia) – lỗi thì bỏ qua, không bịa số
        miss = [it for it in items if it[0] not in off]
        if miss:
            try:
                got, tm = page_rows(url, [n for _, n, _, _ in miss])
                for code, n, t, g in miss:
                    if n in got: off[code] = {'buy': got[n][0], 'sell': got[n][1], 'src': key, 'src_time': tm}
            except Exception as ex: print('lỗi', co, ex)
        for code, n, t, g in items:
            if code in off: rows.append({'code': code, 'brand': co, 'type': t, 'group': g, 'co': co, **off[code]})
    today = dt.datetime.now(VN).date().isoformat()
    H = json.load(open(HIST)) if os.path.exists(HIST) else {}
    for c, *_ in ROWS:  # bổ sung lịch sử thật từ vang.today (giá cuối ngày), không ghi đè ngày đã lưu trừ hôm nay
        try:
            for x in get(f'{VT}?type={c}&days={40 if c == "SJL1L10" else 10}')['history']:
                q = x['prices'].get(c)
                if q and q.get('sell') and (x['date'] == today or x['date'] not in H.get(c, {})):
                    H.setdefault(c, {})[x['date']] = {'buy': q['buy'], 'sell': q['sell']}
        except Exception as ex: print('hist lỗi', c, ex)
    for c in SEED:  # giá chốt có nguồn thật, chỉ thêm nếu chưa có
        for d0, v in SEED[c].items(): H.setdefault(c, {})[d0] = v
    for r in rows:  # giá hiện tại = chốt tạm của hôm nay; so với ngày giao dịch trước đó đã lưu
        h = H.setdefault(r['code'], {}); h[today] = {'buy': r['buy'], 'sell': r['sell']}
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
    hist = {}
    for c in ('SJL1L10', 'SJ9999'):
        h = get(f'{VT}?type={c}&days=30')['history']
        hist[c] = [{'date': x['date'], 'buy': x['prices'][c]['buy'], 'sell': x['prices'][c]['sell']} for x in reversed(h)]
    xau = get('https://api.gold-api.com/price/XAU'); fx = get('https://open.er-api.com/v6/latest/USD')
    usdvnd = fx['rates']['VND']; world_vnd = round(xau['price'] * usdvnd * K / 1e5) * 1e5
    sjc = next(r for r in rows if r['code'] == 'SJL1L10')
    now = dt.datetime.now(VN)
    out = dict(old)
    out.update({'_ghi_chu': 'Phần giá/lịch sử/world/sjc_compare do scripts/update-vn-gold.py tự sinh. peak/refs/analysis/advice/world_news/quick_advice: sửa tay (chỉ số liệu có nguồn). world_news: mỗi mục {text (1 dòng tiếng Việt), source:{name,url}, intl}; luôn giữ ≥1 nguồn quốc tế (ưu tiên CNBC, rồi Reuters/Kitco/Bloomberg), bài trong ngày, link đã kiểm tra.',
        'updated_vn': now.strftime('%H:%M %d/%m/%Y'), 'vt_time': f"{cur['time']} {cur['date']}",
        'rows': rows, 'official_ok': OK, 'official_fail': FAIL, 'history': hist, 'sjc_compare': cmp_, 'row_sources': {k: {'name': v[0], 'url': v[1]} for k, v in SRC.items()},
        'world': {'xau_usd': xau['price'], 'xau_time_utc': xau['updatedAt'], 'usdvnd': usdvnd, 'fx_time_utc': fx['time_last_update_utc'], 'factor': K, 'vnd_per_luong': world_vnd,
                  'gap_sjc_sell': sjc['sell'] - world_vnd, 'note': 'USD/oz × USD/VND (tỷ giá thị trường open.er-api) × 1,20565; chưa gồm thuế, phí'},
        'sources': {'vang_today': 'https://www.vang.today/', 'gold_api': 'https://gold-api.com/', 'fx': 'https://open.er-api.com/'}})
    INTL = ('cnbc', 'reuters', 'kitco', 'bloomberg')
    if not any(any(k in ((n.get('source') or {}).get('name', '') + (n.get('source') or {}).get('url', '')).lower() for k in INTL) for n in out.get('world_news', [])):
        print('CẢNH BÁO: world_news chưa có nguồn quốc tế (CNBC/Reuters/Kitco/Bloomberg) – routine cần bổ sung 1 mục.')
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('SJC', sjc['buy'], sjc['sell'], 'TG quy đổi', world_vnd, 'chênh', sjc['sell'] - world_vnd)
if __name__ == '__main__': main()

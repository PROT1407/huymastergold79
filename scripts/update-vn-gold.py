#!/usr/bin/env python3
"""Cập nhật data/vn-gold-daily.json (Vàng trong nước sáng nay).
Tự động: giá các thương hiệu + thay đổi so với hôm qua + lịch sử 30 ngày (vang.today),
giá thế giới (gold-api.com), tỷ giá USD/VND (open.er-api.com), chênh lệch SJC – thế giới.
Thủ công (giữ nguyên từ file cũ, routine sửa trực tiếp trong JSON): peak, refs, analysis, advice.
Chạy: python3 scripts/update-vn-gold.py"""
import json, os, sys, urllib.request, datetime as dt
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'vn-gold-daily.json')
VN = ZoneInfo('Asia/Ho_Chi_Minh'); K = 1.20565
VT = 'https://www.vang.today/api/prices'
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (huymastergold79)'}), timeout=30))
# (mã vang.today, thương hiệu, loại, nhóm)
ROWS = [('SJL1L10', 'SJC', 'Vàng miếng SJC', 'mieng'), ('DOHNL', 'DOJI Hà Nội', 'Vàng miếng SJC', 'mieng'), ('DOHCML', 'DOJI TP.HCM', 'Vàng miếng SJC', 'mieng'),
        ('PQHNVM', 'PNJ Hà Nội', 'Vàng miếng SJC', 'mieng'), ('BTSJC', 'Bảo Tín Minh Châu', 'Vàng miếng SJC', 'mieng'),
        ('SJ9999', 'SJC', 'Nhẫn tròn 9999', 'nhan'), ('PQHN24NTT', 'PNJ', 'Nhẫn 24K', 'nhan'), ('BT9999NTT', 'Bảo Tín Minh Châu', 'Nhẫn tròn 9999', 'nhan'), ('DOJINHTV', 'DOJI', 'Nhẫn/trang sức 9999 (DOJI Jewelry)', 'nhan')]
def main():
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    cur = get(VT)
    if not cur.get('success'): sys.exit('vang.today lỗi – giữ file cũ')
    P = cur['prices']
    rows = [{'code': c, 'brand': b, 'type': t, 'group': g, 'buy': P[c]['buy'], 'sell': P[c]['sell'], 'chg_buy': P[c]['change_buy'], 'chg_sell': P[c]['change_sell']} for c, b, t, g in ROWS if c in P and P[c].get('sell')]
    hist = {}
    for c in ('SJL1L10', 'SJ9999'):
        h = get(f'{VT}?type={c}&days=30')['history']
        hist[c] = [{'date': x['date'], 'buy': x['prices'][c]['buy'], 'sell': x['prices'][c]['sell']} for x in reversed(h)]
    xau = get('https://api.gold-api.com/price/XAU'); fx = get('https://open.er-api.com/v6/latest/USD')
    usdvnd = fx['rates']['VND']; world_vnd = round(xau['price'] * usdvnd * K / 1e5) * 1e5
    sjc = next(r for r in rows if r['code'] == 'SJL1L10')
    now = dt.datetime.now(VN)
    out = dict(old)
    out.update({'_ghi_chu': 'Phần giá/lịch sử/world do scripts/update-vn-gold.py tự sinh. peak/refs/analysis/advice: sửa tay mỗi sáng (chỉ số liệu có nguồn).',
        'updated_vn': now.strftime('%H:%M %d/%m/%Y'), 'vt_time': f"{cur['time']} {cur['date']}",
        'rows': rows, 'history': hist,
        'world': {'xau_usd': xau['price'], 'xau_time_utc': xau['updatedAt'], 'usdvnd': usdvnd, 'fx_time_utc': fx['time_last_update_utc'], 'factor': K, 'vnd_per_luong': world_vnd,
                  'gap_sjc_sell': sjc['sell'] - world_vnd, 'note': 'USD/oz × USD/VND (tỷ giá thị trường open.er-api) × 1,20565; chưa gồm thuế, phí'},
        'sources': {'vang_today': 'https://www.vang.today/', 'gold_api': 'https://gold-api.com/', 'fx': 'https://open.er-api.com/'}})
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('SJC', sjc['buy'], sjc['sell'], 'TG quy đổi', world_vnd, 'chênh', sjc['sell'] - world_vnd)
if __name__ == '__main__': main()

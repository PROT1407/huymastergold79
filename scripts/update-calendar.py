#!/usr/bin/env python3
"""Cập nhật data/calendar-us.json từ ForexFactory (feed tuần: nfs.faireconomy.media).
Lọc country == USD, impact == High (tin đỏ) – chỉ tin tác động cao. Giờ đổi sang Asia/Ho_Chi_Minh.
Chạy: python3 scripts/update-calendar.py   (feed giới hạn tần suất – đừng gọi quá vài lần/giờ)
Lưu ý: feed tuần KHÔNG có trường 'actual' (số thực tế); nếu sau này có sẽ tự ghi vào."""
import json, sys, urllib.request, datetime as dt
from zoneinfo import ZoneInfo
URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
OUT = __file__.rsplit('/scripts/', 1)[0] + '/data/calendar-us.json'
VN = ZoneInfo('Asia/Ho_Chi_Minh')
# (từ khóa trong tiêu đề, tên tiếng Việt, giải thích)
VI = [
 ('Non-Farm Employment Change', 'Bảng lương phi nông nghiệp (NFP)', 'Số việc làm mới ngoài nông nghiệp. Cao hơn dự báo → USD mạnh, vàng dễ giảm; thấp hơn → hỗ trợ vàng.'),
 ('Unemployment Rate', 'Tỷ lệ thất nghiệp', 'Thất nghiệp tăng → kỳ vọng Fed nới lỏng → thường hỗ trợ vàng.'),
 ('Average Hourly Earnings', 'Thu nhập bình quân theo giờ', 'Lương tăng nhanh → áp lực lạm phát → Fed cứng rắn, bất lợi cho vàng.'),
 ('Core CPI', 'CPI lõi (lạm phát trừ thực phẩm & năng lượng)', 'Chỉ số Fed theo dõi sát. Cao hơn dự báo → lợi suất, USD tăng → vàng dễ giảm.'),
 ('CPI', 'CPI – chỉ số giá tiêu dùng (lạm phát)', 'Lạm phát cao hơn dự báo → kỳ vọng Fed tăng/giữ lãi suất cao → áp lực lên vàng.'),
 ('Core PCE', 'PCE lõi – thước đo lạm phát ưa thích của Fed', 'Cao hơn dự báo → Fed cứng rắn → bất lợi cho vàng.'),
 ('PCE', 'Chỉ số giá PCE', 'Thước đo lạm phát tiêu dùng; tác động tương tự CPI.'),
 ('Core PPI', 'PPI lõi – giá sản xuất', 'Báo trước áp lực lạm phát tới người tiêu dùng.'),
 ('PPI', 'PPI – chỉ số giá sản xuất', 'Giá đầu vào tăng → lạm phát có thể lan sang CPI.'),
 ('Core Retail Sales', 'Doanh số bán lẻ lõi', 'Tiêu dùng mạnh → kinh tế khỏe, Fed ít lý do nới lỏng → USD mạnh.'),
 ('Retail Sales', 'Doanh số bán lẻ', 'Đo sức chi tiêu của người Mỹ; mạnh hơn dự báo thường bất lợi cho vàng.'),
 ('Federal Funds Rate', 'Quyết định lãi suất của Fed (FOMC)', 'Sự kiện lớn nhất. Tăng/giữ cao → áp lực vàng; giảm → hỗ trợ vàng.'),
 ('FOMC', 'FOMC – Ủy ban Thị trường Mở Liên bang', 'Tín hiệu về lộ trình lãi suất – biến động mạnh với vàng.'),
 ('Fed Chair', 'Phát biểu của Chủ tịch Fed', 'Sự kiện rủi ro cao: mọi tín hiệu về lãi suất có thể làm vàng, USD biến động mạnh.'),
 ('Speaks', 'Phát biểu của quan chức Fed', 'Giọng điệu "diều hâu" (cứng rắn) → USD tăng, vàng giảm; "bồ câu" → hỗ trợ vàng.'),
 ('GDP', 'GDP – tăng trưởng kinh tế', 'Tăng trưởng mạnh → Fed ít lý do nới lỏng → USD mạnh.'),
 ('ISM Manufacturing', 'PMI sản xuất ISM', 'Trên 50 = mở rộng; bất ngờ lớn làm USD và vàng biến động.'),
 ('ISM Services', 'PMI dịch vụ ISM', 'Khu vực dịch vụ chiếm phần lớn kinh tế Mỹ; thành phần giá liên quan lạm phát.'),
 ('Unemployment Claims', 'Đơn xin trợ cấp thất nghiệp lần đầu', 'Công bố thứ Năm hằng tuần; tăng mạnh → thị trường lao động yếu → hỗ trợ vàng.'),
 ('JOLTS', 'Số việc làm còn trống JOLTS', 'Đo nhu cầu lao động; giảm → Fed dễ nới lỏng.'),
 ('Philly Fed', 'Chỉ số sản xuất Philadelphia Fed', 'Khảo sát sản xuất khu vực, tín hiệu sớm cho ISM.'),
 ('Empire State', 'Chỉ số sản xuất Empire State (New York)', 'Khảo sát sản xuất khu vực New York.'),
 ('Consumer Sentiment', 'Niềm tin tiêu dùng (ĐH Michigan)', 'Kèm kỳ vọng lạm phát – Fed theo dõi.'),
 ('Bank Holiday', 'Ngày nghỉ lễ ngân hàng Mỹ', 'Thanh khoản thấp, thị trường trái phiếu Mỹ có thể đóng cửa.'),
]
def vi(title):
    for k, n, x in VI:
        if k.lower() in title.lower(): return n, x
    return '', ''
# English explanation for EN pages (en/economic-calendar.html) – same keywords, US-trader voice
EN = {
 'Non-Farm Employment Change': 'Headline jobs number. A beat lifts the dollar and usually hits gold; a miss is gold-supportive.',
 'Unemployment Rate': 'A rising jobless rate boosts rate-cut/pause bets – typically supportive for gold.',
 'Average Hourly Earnings': 'Hot wage growth means sticky inflation and a more hawkish Fed – a headwind for gold.',
 'Core CPI': 'The print the Fed watches most closely. Above forecast → yields and the dollar jump → gold usually sells off.',
 'CPI': 'Hotter inflation raises the odds the Fed hikes or holds high for longer – pressure on gold.',
 'Core PCE': "The Fed's preferred inflation gauge. Above forecast → hawkish Fed → bearish gold.",
 'PCE': 'Consumer inflation gauge; trades much like CPI.',
 'Core PPI': 'Early read on pipeline inflation heading to consumers.',
 'PPI': 'Rising input costs can feed into CPI down the line.',
 'Core Retail Sales': 'Strong spending = resilient economy, less reason to ease → firmer dollar.',
 'Retail Sales': 'Gauges US consumer spending; a beat is usually a negative for gold.',
 'Federal Funds Rate': 'The biggest event of the month. A hike or hawkish hold weighs on gold; a cut supports it.',
 'FOMC': 'Signals on the rate path – expect sharp moves in gold.',
 'Fed Chair': 'High-risk event: any hint on rates can whip gold and the dollar.',
 'Speaks': 'Hawkish tone → dollar up, gold down; dovish tone → supportive for gold.',
 'GDP': 'Strong growth gives the Fed less reason to ease → firmer dollar.',
 'ISM Manufacturing': 'Above 50 = expansion; big surprises move the dollar and gold.',
 'ISM Services': 'Services are the bulk of the US economy; the prices-paid component matters for inflation.',
 'Unemployment Claims': 'Out every Thursday; a jump signals a softer labor market → supportive for gold.',
 'JOLTS': 'Measures labor demand; falling openings make Fed easing more likely.',
 'Philly Fed': 'Regional manufacturing survey, an early read on ISM.',
 'Empire State': 'New York regional manufacturing survey.',
 'Consumer Sentiment': 'Includes inflation expectations the Fed tracks closely.',
 'Bank Holiday': 'Thin liquidity; US bond markets may be closed.',
}
def en(title):
    for k, _n, _x in VI:
        if k.lower() in title.lower(): return EN.get(k, '')
    return ''
def main():
    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0 (huymastergold79 calendar)'})
    raw = json.load(urllib.request.urlopen(req, timeout=30))
    if not isinstance(raw, list) or not raw: sys.exit('Feed rỗng/không hợp lệ – giữ nguyên file cũ')
    ev = []
    for x in raw:
        if x.get('country') != 'USD' or x.get('impact') != 'High': continue
        t = dt.datetime.fromisoformat(x['date']).astimezone(VN)
        n, ex = vi(x['title'])
        ev.append({'title': x['title'], 'title_vi': n, 'explain': ex, 'explain_en': en(x['title']), 'impact': x['impact'],
                   'time_utc': t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'time_vn': t.strftime('%H:%M %d/%m/%Y'), 'date_vn': t.strftime('%Y-%m-%d'),
                   'forecast': x.get('forecast', ''), 'previous': x.get('previous', ''), 'actual': x.get('actual', '')})
    ev.sort(key=lambda e: e['time_utc'])
    # Giữ lại số thực tế đã điền tay (từ nguồn uy tín) khi feed không có 'actual'
    try:
        old = {(o['title'], o['time_utc']): o for o in json.load(open(OUT)).get('events', [])}
    except Exception:
        old = {}
    for e in ev:
        o = old.get((e['title'], e['time_utc']))
        if o and not e['actual'] and o.get('actual'):
            for k, v in o.items():
                if k.startswith('actual'): e[k] = v
    now = dt.datetime.now(VN)
    out = {'_ghi_chu': 'Tự sinh bởi scripts/update-calendar.py từ ForexFactory – đừng sửa tay. Giờ: Asia/Ho_Chi_Minh.',
           'source': {'name': 'ForexFactory', 'url': 'https://www.forexfactory.com/calendar', 'feed': URL},
           'updated_vn': now.strftime('%H:%M %d/%m/%Y'), 'updated_utc': now.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'has_actual': any(e.get('actual') for e in ev), 'events': ev}
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(ev)} sự kiện USD (High) → {OUT}')
if __name__ == '__main__': main()

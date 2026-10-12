#!/usr/bin/env python3
"""Cập nhật data/calendar-us.json từ ForexFactory (feed tuần: nfs.faireconomy.media).
Lọc country == USD, impact High/Medium (+ Holiday). Giờ đổi sang Asia/Ho_Chi_Minh.
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
def main():
    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0 (huymastergold79 calendar)'})
    raw = json.load(urllib.request.urlopen(req, timeout=30))
    if not isinstance(raw, list) or not raw: sys.exit('Feed rỗng/không hợp lệ – giữ nguyên file cũ')
    ev = []
    for x in raw:
        if x.get('country') != 'USD' or x.get('impact') not in ('High', 'Medium', 'Holiday'): continue
        t = dt.datetime.fromisoformat(x['date']).astimezone(VN)
        n, ex = vi(x['title'])
        ev.append({'title': x['title'], 'title_vi': n, 'explain': ex, 'impact': x['impact'],
                   'time_utc': t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'time_vn': t.strftime('%H:%M %d/%m/%Y'), 'date_vn': t.strftime('%Y-%m-%d'),
                   'forecast': x.get('forecast', ''), 'previous': x.get('previous', ''), 'actual': x.get('actual', '')})
    ev.sort(key=lambda e: e['time_utc'])
    now = dt.datetime.now(VN)
    out = {'_ghi_chu': 'Tự sinh bởi scripts/update-calendar.py từ ForexFactory – đừng sửa tay. Giờ: Asia/Ho_Chi_Minh.',
           'source': {'name': 'ForexFactory', 'url': 'https://www.forexfactory.com/calendar', 'feed': URL},
           'updated_vn': now.strftime('%H:%M %d/%m/%Y'), 'updated_utc': now.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'has_actual': any('actual' in x for x in raw), 'events': ev}
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(ev)} sự kiện USD (High/Medium/Holiday) → {OUT}')
if __name__ == '__main__': main()

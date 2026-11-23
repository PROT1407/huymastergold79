#!/usr/bin/env python3
"""Cập nhật data/calendar-us.json từ ForexFactory (feed tuần: nfs.faireconomy.media).
Lọc country == USD, impact == High (tin đỏ) – chỉ tin tác động cao. Giờ đổi sang Asia/Ho_Chi_Minh.
Chạy: python3 scripts/update-calendar.py   (feed giới hạn tần suất – đừng gọi quá vài lần/giờ)
      python3 scripts/update-calendar.py --check
Lưu ý: feed tuần KHÔNG có trường 'actual'. Số đã điền (actual*) được giữ lại.
Số thực tế mới do scripts/calendar_actuals.py điền từ CNBC rồi BLS/BEA/Fed.
Feed rỗng, không có tin USD High, hoặc file không hợp lệ: không ghi đè, thoát lỗi."""
import json, sys, urllib.request, datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo
import calendar_io
URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
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
NOTE = 'Tự sinh bởi scripts/update-calendar.py từ ForexFactory – đừng sửa tay. Giờ: Asia/Ho_Chi_Minh.'


def events_from_feed(raw, old_events):
    if not isinstance(raw, list) or not raw:
        raise ValueError('Feed rỗng/không hợp lệ – giữ nguyên file cũ')
    old = {(o.get('title'), o.get('time_utc')): o for o in (old_events or []) if isinstance(o, dict)}
    ev = []
    for x in raw:
        if x.get('country') != 'USD' or x.get('impact') != 'High':
            continue
        if not x.get('title') or not x.get('date'):
            raise ValueError('Feed thiếu title/date – không ghi file')
        t = dt.datetime.fromisoformat(x['date']).astimezone(VN)
        name, explain = vi(x['title'])
        event = {
            'title': x['title'], 'title_vi': name, 'explain': explain, 'explain_en': en(x['title']),
            'impact': x['impact'],
            'time_utc': t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'time_vn': t.strftime('%H:%M %d/%m/%Y'), 'date_vn': t.strftime('%Y-%m-%d'),
            'forecast': x.get('forecast') or '', 'previous': x.get('previous') or '',
            'actual': x.get('actual') or '',
        }
        # Giữ số thực tế đã có nguồn khi feed không có actual. Không xóa actual cũ.
        prev = old.get((event['title'], event['time_utc']))
        if prev and not event['actual'] and prev.get('actual'):
            for key, value in prev.items():
                if key.startswith('actual'):
                    event[key] = value
        ev.append(event)
    ev.sort(key=lambda event: event['time_utc'])
    if not ev:
        raise ValueError('Không có tin USD High – không ghi file trống')
    return ev


def document_text(events, old_doc, now):
    doc = {
        '_ghi_chu': NOTE,
        'source': {'name': 'ForexFactory', 'url': 'https://www.forexfactory.com/calendar', 'feed': URL},
        'updated_vn': now.astimezone(VN).strftime('%H:%M %d/%m/%Y'),
        'updated_utc': now.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'has_actual': any(bool(event.get('actual')) for event in events),
        'events': events,
    }
    calendar_io.validate_calendar(doc)
    if isinstance(old_doc, dict) and old_doc.get('updated_vn') and old_doc.get('updated_utc'):
        kept = dict(doc)
        kept['updated_vn'] = old_doc['updated_vn']
        kept['updated_utc'] = old_doc['updated_utc']
        if calendar_io.render(kept) == calendar_io.render(old_doc):
            return None
    return calendar_io.render(doc)


def prepare(raw, old_doc, now):
    return document_text(events_from_feed(raw, (old_doc or {}).get('events') if isinstance(old_doc, dict) else None), old_doc, now)


def load_old(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception:
        return None


def fetch_feed():
    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0 (huymastergold79 calendar)'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = calendar_io.OUT
    if '--check' in argv:
        try:
            calendar_io.validate_calendar(json.loads(Path(out).read_text(encoding='utf-8')))
        except Exception as ex:
            sys.exit(f'Lịch không hợp lệ: {ex}')
        print(f'calendar ok {out}')
        return 0
    try:
        text = prepare(fetch_feed(), load_old(out), dt.datetime.now(VN))
    except Exception as ex:
        sys.exit(f'Không ghi lịch: {ex}')
    if text is None:
        print(f'không đổi → {out}')
        return 0
    calendar_io.atomic_write(out, text)
    print(f'{len(json.loads(text)["events"])} sự kiện USD (High) → {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

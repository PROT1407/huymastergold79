#!/usr/bin/env python3
"""Điền actual cho tin đỏ USD đã công bố trong data/calendar-us.json.

Thứ tự nguồn: CNBC, rồi cơ quan phát hành (BLS, BEA, Fed). Chỉ ghi số đọc được
từ bản công bố của đúng kỳ (tháng/quý/tuần/ngày quyết định). Không tính % từ
hai mức chỉ số. Không bịa. Actual đã có thì giữ nguyên.

BLS: bảng 1-month percent change / net change / level trên data.bls.gov
(không cần API key; calculations của api.bls.gov bị tắt nếu không có key).
BEA: RSS và trang Personal Income. Fed: thông cáo FOMC (biên trên của vùng
mục tiêu) và FRED ICSA cho đơn xin trợ cấp (số đã công bố, không phải % tự tính).
"""
import datetime as dt
import html
import json
import re
import sys
import urllib.request
from fractions import Fraction
from zoneinfo import ZoneInfo

import calendar_io

VN = ZoneInfo('Asia/Ho_Chi_Minh')
ET = ZoneInfo('America/New_York')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
CNBC_RSS = 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258'
BEA_RSS = 'https://apps.bea.gov/rss/rss.xml'
FED_RSS = 'https://www.federalreserve.gov/feeds/press_monetary.xml'
FRED_CLAIMS = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=ICSA'
MONTHS = (
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
)
# (series id, output_view or None, how to format the published cell)
# Core PPI is final demand less foods and energy (WPSFD49104), the print
# ForexFactory labels "Core PPI" — September 2026 on this table is 0.7.
BLS_SERIES = {
    'cpi_mm': ('CUSR0000SA0', 'pct_1mth', 'percent'),
    'core_cpi_mm': ('CUSR0000SA0L1E', 'pct_1mth', 'percent'),
    'cpi_yy': ('CUSR0000SA0', 'pct_12mths', 'percent'),
    'core_cpi_yy': ('CUSR0000SA0L1E', 'pct_12mths', 'percent'),
    'ppi_mm': ('WPSFD4', 'pct_1mth', 'percent'),
    'core_ppi_mm': ('WPSFD49104', 'pct_1mth', 'percent'),
    'ppi_yy': ('WPSFD4', 'pct_12mths', 'percent'),
    'core_ppi_yy': ('WPSFD49104', 'pct_12mths', 'percent'),
    'nfp': ('CES0000000001', 'net_1mth', 'thousands'),
    'unemployment': ('LNS14000000', None, 'percent'),
    'ahe_mm': ('CES0500000003', 'pct_1mth', 'percent'),
    'ahe_yy': ('CES0500000003', 'pct_12mths', 'percent'),
}
_FORECAST = re.compile(
    r'\b(expected to|economists (?:had )?(?:expected|forecast|estimated)|'
    r'forecast (?:of|for|at)|estimates? for|looking for|consensus (?:of|for|at)|'
    r'seen (?:rising|falling))\b', re.I)


def classify(title):
    text = (title or '').lower()
    yearly = 'y/y' in text
    if 'claim' in text:
        return 'claims'
    if 'federal funds' in text:
        return 'fed_funds'
    if 'non-farm' in text or 'nonfarm' in text:
        return 'nfp'
    if 'unemployment rate' in text:
        return 'unemployment'
    if 'average hourly' in text or 'hourly earnings' in text:
        return 'ahe_yy' if yearly else 'ahe_mm'
    if 'core cpi' in text:
        return 'core_cpi_yy' if yearly else 'core_cpi_mm'
    if re.search(r'\bcpi\b', text):
        return 'cpi_yy' if yearly else 'cpi_mm'
    if 'core pce' in text or ('pce' in text and 'core' in text):
        return 'core_pce_yy' if yearly else 'core_pce_mm'
    if 'pce' in text:
        return 'pce_yy' if yearly else 'pce_mm'
    if 'core ppi' in text or ('ppi' in text and 'core' in text):
        return 'core_ppi_yy' if yearly else 'core_ppi_mm'
    if re.search(r'\bppi\b', text):
        return 'ppi_yy' if yearly else 'ppi_mm'
    if 'core retail' in text:
        return 'core_retail_mm'
    if 'retail sales' in text:
        return 'retail_mm'
    if 'gdp' in text:
        if 'advance' in text:
            return 'gdp_advance'
        if 'prelim' in text or 'second' in text:
            return 'gdp_second'
        if 'final' in text or 'third' in text:
            return 'gdp_third'
    return None


def parse_utc(value):
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def previous_month(day):
    if day.month == 1:
        return day.year - 1, 12
    return day.year, day.month - 1


def previous_quarter(day):
    quarter = (day.month - 1) // 3 + 1
    if quarter == 1:
        return day.year - 1, 4
    return day.year, quarter - 1


def claims_week_ending(day):
    """Saturday covered by a Thursday (or Friday) claims release."""
    return day - dt.timedelta(days=(day.weekday() - 5) % 7)


def reference(kind, when_utc):
    local = when_utc.astimezone(ET)
    day = local.date()
    if kind == 'fed_funds':
        return ('day', day)
    if kind == 'claims':
        return ('week', claims_week_ending(day))
    if kind.startswith('gdp_'):
        year, quarter = previous_quarter(day)
        vintage = kind.split('_', 1)[1]
        return ('quarter', year, quarter, vintage)
    year, month = previous_month(day)
    return ('month', year, month)


def one_decimal_percent(number):
    if not re.fullmatch(r'-?\d+(?:\.\d)?', number or ''):
        return None
    if '.' not in number:
        number += '.0'
    return number + '%'


def jobs_to_k(token):
    token = (token or '').strip()
    if re.fullmatch(r'-?\d+K', token, re.I):
        return token[:-1] + 'K'
    if re.fullmatch(r'-?\d{1,3}(?:,\d{3})+', token):
        value = int(token.replace(',', ''))
        if value % 1000:
            return None
        return f'{value // 1000}K'
    return None


def format_cell(cell, how):
    if cell is None:
        return None
    if how == 'percent':
        return one_decimal_percent(cell)
    if how == 'thousands':
        if not re.fullmatch(r'-?\d+', cell):
            return None
        return f'{int(cell)}K'
    return None


def clean_cell(raw):
    text = html.unescape(re.sub(r'<[^>]+>', '', raw or '')).replace('\xa0', ' ').strip()
    if not text or '(X)' in text or text in {'-', '—', 'NA', 'N/A'}:
        return None
    text = re.sub(r'\([A-Za-z0-9]+\)', '', text).strip()
    return text or None


def bls_month_cell(page, year, month):
    """Published BLS cell for calendar month 1–12. None if blank or unavailable."""
    if not page or not 1 <= month <= 12:
        return None
    table = re.search(r'<TABLE id="table0"[\s\S]*?</TABLE>', page, re.I)
    region = table.group(0) if table else page
    row = re.search(rf'<TH scope="row">\s*{year}\s*</TH>(.*?)</TR>', region, re.I | re.S)
    if not row:
        return None
    cells = re.findall(r'<TD>(.*?)</TD>', row.group(1), re.I | re.S)
    if len(cells) < month:
        return None
    return clean_cell(cells[month - 1])


def bls_url(series_id, view):
    url = f'https://data.bls.gov/timeseries/{series_id}'
    if view:
        url += '?output_view=' + view
    return url


def same_actual(left, right):
    def norm(value):
        value = value.strip().upper().replace(',', '')
        match = re.fullmatch(r'(-?\d+(?:\.\d+)?)([%K]?)', value)
        if not match:
            return value
        return (float(match.group(1)), match.group(2))
    return norm(left) == norm(right)


def choose(cnbc, official, official_name):
    if cnbc and official and not same_actual(cnbc, official):
        print(f'không ghi: CNBC {cnbc} khác {official_name} {official}')
        return None, None
    if cnbc:
        return cnbc, 'CNBC'
    if official:
        return official, official_name
    return None, None


def _bad_before(text, start):
    return bool(_FORECAST.search(text[max(0, start - 90):start]))


def _unique(matches):
    values = []
    for number in matches:
        if number and number not in values:
            values.append(number)
    if len(values) != 1:
        return None
    return values[0]


def _find_percents(pattern, text):
    found = []
    for match in re.finditer(pattern, text, re.I):
        if _bad_before(text, match.start(1)):
            continue
        found.append(match.group(1))
    return _unique(found)


def parse_cnbc(title, body, month_name):
    """Pull published prints whose wording names this month. Ambiguous pages yield nothing."""
    title = html.unescape(title or '')
    body = html.unescape(body or '')
    if re.search(r'what to expect|preview|ahead of|coming up', title, re.I):
        return {}
    month = month_name.lower()
    blob = f'{title} {body}'
    if month not in blob.lower():
        return {}
    out = {}
    headline = _find_percents(
        rf'(?:consumer prices|cpi)\b[^.]{{0,80}}?(?:rose|increased|fell|decreased|declined) '
        rf'(-?\d+(?:\.\d)?)% in {month}', blob)
    adjusted = _find_percents(
        rf'consumer price index\b[^.]{{0,180}}?seasonally adjusted (-?\d+(?:\.\d)?)%', body)
    cpi = _unique([value for value in (headline, adjusted) if value])
    if cpi and one_decimal_percent(cpi):
        out['cpi_mm'] = one_decimal_percent(cpi)
    core = _find_percents(
        r'core cpi\b[^.]{0,100}?(?:increased|rose|fell|decreased|declined) (-?\d+(?:\.\d)?)%', body)
    if core and one_decimal_percent(core):
        out['core_cpi_mm'] = one_decimal_percent(core)
    nfp = _unique([
        jobs_to_k(match.group(1))
        for match in re.finditer(
            rf'(?:nonfarm payrolls (?:increased|rose|fell|decreased|dropped) by |added )'
            rf'([\d,]+)(?: jobs)? in {month}', blob, re.I)
        if not _bad_before(blob, match.start(1)) and jobs_to_k(match.group(1))
    ])
    if nfp:
        out['nfp'] = nfp
    jobless = _find_percents(
        rf'unemployment rate\b[^%]{{0,50}}?(-?\d+(?:\.\d)?)%', blob)
    if jobless and month in blob.lower() and one_decimal_percent(jobless):
        out['unemployment'] = one_decimal_percent(jobless)
    wages = re.search(
        r'average hourly earnings (?:increased|rose|fell) (-?\d+(?:\.\d)?)% on the month'
        r'(?: and (-?\d+(?:\.\d)?)% annually)?', body, re.I)
    if wages and not _bad_before(body, wages.start(1)):
        if one_decimal_percent(wages.group(1)):
            out['ahe_mm'] = one_decimal_percent(wages.group(1))
        if wages.group(2) and one_decimal_percent(wages.group(2)):
            out['ahe_yy'] = one_decimal_percent(wages.group(2))
    ppi = _find_percents(
        rf'producer price index\b[^%]{{0,90}}?(?:rose|increased|fell|decreased) '
        rf'(-?\d+(?:\.\d)?)%[^.]{{0,40}}\b{month}\b', blob)
    if ppi and one_decimal_percent(ppi):
        out['ppi_mm'] = one_decimal_percent(ppi)
    if re.search(r'\bppi\b|producer price', title, re.I):
        core_ppi = _find_percents(
            r'core ppi\b[^%]{0,80}?(?:rose|increased|fell|decreased) (-?\d+(?:\.\d)?)%', body)
        if core_ppi and one_decimal_percent(core_ppi):
            out['core_ppi_mm'] = one_decimal_percent(core_ppi)
    retail = _find_percents(
        rf'(?<!core )retail sales (?:rose|increased|fell|decreased|declined) '
        rf'(-?\d+(?:\.\d)?)% in {month}', blob)
    if retail and one_decimal_percent(retail):
        out['retail_mm'] = one_decimal_percent(retail)
    core_retail = _find_percents(
        r'(?:core retail sales|excluding autos)\b[^%]{0,50}?(?:rose|increased|fell|decreased) '
        r'(-?\d+(?:\.\d)?)%', body)
    if core_retail and one_decimal_percent(core_retail):
        out['core_retail_mm'] = one_decimal_percent(core_retail)
    gdp = _find_percents(
        r'(?:real gross domestic product \(gdp\)|gdp) (?:increased|grew|expanded|contracted)'
        r'(?: at an annual(?:ized)? rate of)? (-?\d+(?:\.\d)?)%', blob)
    if gdp and one_decimal_percent(gdp):
        out['gdp'] = one_decimal_percent(gdp)
    return out


def parse_bound(token):
    match = re.fullmatch(r'(\d+)(?:-(\d+)/(\d+))?', token or '')
    if not match:
        return None
    value = Fraction(int(match.group(1)))
    if match.group(2):
        value += Fraction(int(match.group(2)), int(match.group(3)))
    return value


def format_funds(value):
    if value is None:
        return None
    scaled = value * 100
    if scaled != int(scaled):
        return None
    return f'{float(value):.2f}%'


def parse_funds_range(text):
    match = re.search(
        r'(?:target range for the federal funds rate|federal funds rate)'
        r' at (\d+(?:-\d+/\d+)?) to (\d+(?:-\d+/\d+)?) percent',
        text or '', re.I)
    if not match:
        return None
    return format_funds(parse_bound(match.group(2)))


def rss_items(xml):
    items = []
    for chunk in (xml or '').split('<item')[1:]:
        def grab(tag, chunk=chunk):
            match = re.search(rf'<{tag}[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>', chunk, re.S | re.I)
            return html.unescape(re.sub(r'\s+', ' ', match.group(1))).strip() if match else ''
        link = grab('link')
        if link:
            items.append({'title': grab('title'), 'link': link, 'description': grab('description')})
    return items


def html_to_text(page):
    text = re.sub(r'<script[\s\S]*?</script>', ' ', page or '', flags=re.I)
    text = re.sub(r'<style[\s\S]*?</style>', ' ', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', html.unescape(text)).strip()


def parse_bea_gdp(xml):
    """Return {(year, quarter, vintage): '3.4%'} from BEA release titles and descriptions."""
    vintages = {'advance': 'advance', 'second': 'second', 'third': 'third'}
    quarters = {'1st': 1, '2nd': 2, '3rd': 3, '4th': 4, 'first': 1, 'second': 2, 'third': 3, 'fourth': 4}
    found = {}
    for item in rss_items(xml):
        title = item['title']
        match = re.search(
            r'GDP \((Advance|Second|Third) Estimate\), (1st|2nd|3rd|4th|first|second|third|fourth) Quarter (\d{4})',
            title, re.I)
        if not match:
            continue
        percent = re.search(r'annual rate of (-?\d+(?:\.\d+)?) percent', item['description'], re.I)
        formatted = one_decimal_percent(percent.group(1)) if percent else None
        if not formatted:
            continue
        key = (int(match.group(3)), quarters[match.group(2).lower()], vintages[match.group(1).lower()])
        if key in found and found[key] != formatted:
            found[key] = None
        else:
            found.setdefault(key, formatted)
    return {key: value for key, value in found.items() if value}


def parse_bea_pce(title, text):
    """Month-over-month PCE prices from a Personal Income page. y/y is the later sentence."""
    match = re.search(r'Personal Income and Outlays, ([A-Za-z]+) (\d{4})', title or '', re.I)
    if not match or match.group(1).lower() not in {name.lower() for name in MONTHS}:
        return {}
    month = match.group(1).lower()
    year = int(match.group(2))
    parts = re.split(r'from the same month one year ago', text or '', flags=re.I, maxsplit=1)
    monthly, yearly = parts[0], parts[1] if len(parts) > 1 else ''
    out = {}
    headline = re.search(rf'PCE price index for {month} increased (-?\d+(?:\.\d)?) percent', monthly, re.I)
    core = re.search(
        r'Excluding food and energy, the PCE price index increased (-?\d+(?:\.\d)?) percent', monthly, re.I)
    if headline and one_decimal_percent(headline.group(1)):
        out[('pce_mm', year, MONTHS.index(match.group(1).capitalize()) + 1)] = one_decimal_percent(headline.group(1))
    if core and one_decimal_percent(core.group(1)):
        out[('core_pce_mm', year, MONTHS.index(match.group(1).capitalize()) + 1)] = one_decimal_percent(core.group(1))
    y_head = re.search(rf'PCE price index for {month} increased (-?\d+(?:\.\d)?) percent', yearly, re.I)
    y_core = re.search(
        r'Excluding food and energy, the PCE price index increased (-?\d+(?:\.\d)?) percent', yearly, re.I)
    if y_head and one_decimal_percent(y_head.group(1)):
        out[('pce_yy', year, MONTHS.index(match.group(1).capitalize()) + 1)] = one_decimal_percent(y_head.group(1))
    if y_core and one_decimal_percent(y_core.group(1)):
        out[('core_pce_yy', year, MONTHS.index(match.group(1).capitalize()) + 1)] = one_decimal_percent(y_core.group(1))
    return out


def parse_fred_claims(csv_text):
    """Map week-ending Saturday to the published SA initial-claims level, in K."""
    found = {}
    for line in (csv_text or '').splitlines()[1:]:
        parts = [part.strip() for part in line.split(',')]
        if len(parts) < 2 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', parts[0]):
            continue
        if not re.fullmatch(r'\d+', parts[1]):
            continue
        value = int(parts[1])
        if value % 1000:
            continue
        found[dt.date.fromisoformat(parts[0])] = f'{value // 1000}K'
    return found


class Cache:
    def __init__(self, get):
        self.get = get
        self.pages = {}

    def __call__(self, url):
        if url not in self.pages:
            try:
                self.pages[url] = self.get(url) or ''
            except Exception as ex:
                print(f'nguồn lỗi {url} ({type(ex).__name__})')
                self.pages[url] = ''
        return self.pages[url]


def _cnbc_for_month(cache, year, month):
    key = ('cnbc-month', year, month)
    if key in cache.pages:
        return cache.pages[key]
    month_name = MONTHS[month - 1]
    merged = {}
    rss = cache(CNBC_RSS)
    fetched = 0
    for item in rss_items(rss):
        title = item['title']
        if re.search(r'\b(china|euro zone|eurozone|bank of england|boj|ecb)\b', title, re.I):
            continue
        if month_name.lower() not in f"{title} {item['description']}".lower():
            continue
        if re.search(r'what to expect|preview|ahead of', title, re.I):
            continue
        if fetched >= 8:
            break
        fetched += 1
        body = html_to_text(cache(item['link']))
        parsed = parse_cnbc(title, f"{item['description']} {body}", month_name)
        for kind, value in parsed.items():
            if kind in merged and merged[kind] != value:
                merged[kind] = None
            else:
                merged.setdefault(kind, value)
    result = {kind: value for kind, value in merged.items() if value}
    cache.pages[key] = result
    return result


def _bls(cache, kind, year, month):
    spec = BLS_SERIES.get(kind)
    if not spec:
        return None
    series_id, view, how = spec
    cell = bls_month_cell(cache(bls_url(series_id, view)), year, month)
    return format_cell(cell, how)


def _gdp(cache, year, quarter, vintage):
    key = 'bea-gdp'
    if key not in cache.pages:
        cache.pages[key] = parse_bea_gdp(cache(BEA_RSS))
    return cache.pages[key].get((year, quarter, vintage))


def _pce(cache, kind, year, month):
    key = ('bea-pce', year, month)
    if key not in cache.pages:
        month_name = MONTHS[month - 1]
        found = {}
        for item in rss_items(cache(BEA_RSS)):
            if not re.search(rf'Personal Income and Outlays, {month_name} {year}', item['title'], re.I):
                continue
            page = html_to_text(cache(item['link']))
            found = parse_bea_pce(item['title'], page)
            break
        cache.pages[key] = found
    return cache.pages[key].get((kind, year, month))


def _funds(cache, day):
    token = day.strftime('%Y%m%d')
    xml = cache(FED_RSS)
    match = re.search(
        rf'https://www\.federalreserve\.gov/newsevents/pressreleases/monetary{token}a\.htm', xml or '')
    if not match:
        return None
    return parse_funds_range(html_to_text(cache(match.group(0))))


def _claims_fred(cache):
    key = 'fred-claims'
    if key not in cache.pages:
        cache.pages[key] = parse_fred_claims(cache(FRED_CLAIMS))
    return cache.pages[key]


def lookup_event(event, cache):
    kind = classify(event.get('title'))
    when = parse_utc(event.get('time_utc'))
    if not kind or when is None:
        return None, None
    period = reference(kind, when)
    cnbc = None
    official = None
    official_name = None
    if period[0] == 'month':
        _, year, month = period
        cnbc = _cnbc_for_month(cache, year, month).get(kind)
        if kind in BLS_SERIES:
            official, official_name = _bls(cache, kind, year, month), 'BLS'
        elif kind in ('pce_mm', 'core_pce_mm', 'pce_yy', 'core_pce_yy'):
            official, official_name = _pce(cache, kind, year, month), 'BEA'
    elif period[0] == 'quarter':
        _, year, quarter, vintage = period
        cnbc = _cnbc_gdp(cache, year, quarter)
        official, official_name = _gdp(cache, year, quarter, vintage), 'BEA'
    elif period[0] == 'day' and kind == 'fed_funds':
        return choose(_cnbc_funds(cache, period[1]), _funds(cache, period[1]), 'Fed')
    elif period[0] == 'week' and kind == 'claims':
        cnbc = _cnbc_claims(cache, period[1])
        official = _claims_fred(cache).get(period[1])
        official_name = 'Fed'
    return choose(cnbc, official, official_name or 'BLS')


def _cnbc_gdp(cache, year, quarter):
    names = {1: 'first', 2: 'second', 3: 'third', 4: 'fourth'}
    ordinals = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}
    label = names[quarter]
    rss = cache(CNBC_RSS)
    found = []
    fetched = 0
    for item in rss_items(rss):
        blob = f"{item['title']} {item['description']}"
        if str(year) not in blob or 'gdp' not in blob.lower():
            continue
        if not re.search(rf'\b(?:{label}|{ordinals[quarter]})\b', blob, re.I):
            continue
        if fetched >= 4:
            break
        fetched += 1
        text = f"{item['title']} {html_to_text(cache(item['link']))}"
        value = _find_percents(
            r'(?:real gross domestic product \(gdp\)|gdp) (?:increased|grew|expanded|contracted)'
            r'(?: at an annual(?:ized)? rate of)? (-?\d+(?:\.\d)?)%', text)
        formatted = one_decimal_percent(value) if value else None
        if formatted:
            found.append(formatted)
    return _unique(found)


def _cnbc_funds(cache, day):
    found = []
    fetched = 0
    for item in rss_items(cache(CNBC_RSS)):
        if 'fed' not in item['title'].lower() and 'fomc' not in item['title'].lower():
            continue
        preview = f"{item['title']} {item['description']}"
        if not re.search(rf'\b{MONTHS[day.month - 1]}\b', preview, re.I) and day.isoformat() not in preview:
            continue
        if fetched >= 3:
            break
        fetched += 1
        text = preview + ' ' + html_to_text(cache(item['link']))
        value = parse_funds_range(text)
        if value:
            found.append(value)
    return _unique(found)


def _cnbc_claims(cache, week_ending):
    """Only accept a CNBC claims figure when the copy names that week-ending date."""
    pretty = f'{MONTHS[week_ending.month - 1]} {week_ending.day}'
    found = []
    fetched = 0
    for item in rss_items(cache(CNBC_RSS)):
        if 'claim' not in f"{item['title']} {item['description']}".lower():
            continue
        if fetched >= 3:
            break
        fetched += 1
        text = f"{item['title']} {item['description']} {html_to_text(cache(item['link']))}"
        if pretty.lower() not in text.lower() and week_ending.isoformat() not in text:
            continue
        for match in re.finditer(
                r'(?:initial )?(?:jobless|unemployment) claims\b[^.]{0,80}?([\d,]{5,})', text, re.I):
            if _bad_before(text, match.start(1)):
                continue
            formatted = jobs_to_k(match.group(1))
            if formatted:
                found.append(formatted)
    return _unique(found)


def apply_actuals(doc, now, lookup):
    """Fill empty actuals for High events already released. Return titles that changed."""
    changed = []
    for event in doc.get('events') or []:
        if event.get('actual'):
            continue
        if event.get('impact') != 'High' or not classify(event.get('title')):
            continue
        when = parse_utc(event.get('time_utc'))
        if when is None or when > now:
            continue
        try:
            value, source = lookup(event)
        except Exception as ex:
            print(f'bỏ {event.get("title")}: {type(ex).__name__}')
            continue
        if not value or not source:
            print(f'chưa có số đã công bố: {event.get("title")}')
            continue
        event['actual'] = value
        event['actual_src'] = source
        changed.append(event['title'])
        print(f'actual {event["title"]} = {value} ({source})')
    return changed


def stamp(doc, now):
    moment = now.astimezone(dt.timezone.utc)
    doc['updated_vn'] = moment.astimezone(VN).strftime('%H:%M %d/%m/%Y')
    doc['updated_utc'] = moment.strftime('%Y-%m-%dT%H:%M:%SZ')
    doc['has_actual'] = any(bool(event.get('actual')) for event in doc['events'])


def http_get(url, timeout=25):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode('utf-8', 'replace')


def run(doc, now, get=http_get):
    cache = Cache(get)
    changed = apply_actuals(doc, now, lambda event: lookup_event(event, cache))
    if not changed:
        return False
    stamp(doc, now)
    calendar_io.validate_calendar(doc)
    return True


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    path = calendar_io.OUT
    dry = '--dry-run' in argv
    try:
        doc = json.loads(path.read_text(encoding='utf-8'))
        calendar_io.validate_calendar(doc)
    except Exception as ex:
        sys.exit(f'Không đọc được lịch: {ex}')
    now = dt.datetime.now(dt.timezone.utc)
    try:
        changed = run(doc, now)
    except Exception as ex:
        sys.exit(f'Không điền số thực tế: {ex}')
    if not changed:
        print('actual không đổi')
        return 0
    if dry:
        print('dry-run, không ghi file')
        return 0
    calendar_io.atomic_write(path, calendar_io.render(doc))
    print(f'đã ghi actual → {path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

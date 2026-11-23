#!/usr/bin/env python3
"""Publish H79 boards without Grok Bot.

Vietnam is UTC+7 all year. The workflow clocks are:

- macro, weekdays, up to three updates a VN day:
  morning 06:37 VN = 23:37 UTC the previous calendar day (`37 23 * * 0-4`),
  with a backup at 05:52 VN = 22:52 UTC (`52 22 * * 0-4`);
  noon 12:07 VN = 05:07 UTC (`7 5 * * 1-5`); evening 19:17 VN = 12:17 UTC (`17 12 * * 1-5`).
  GitHub delays scheduled runs, so the slot (sang/trua/toi) comes from the VN clock
  when the run actually starts, not from the cron line. A later update is published
  only when the slot is still free, at least three hours have passed since the last
  update that day, and the generator returned stories not already on the board.
- domestic, weekdays 08:43 VN = 01:43 UTC the same weekday (`43 1 * * 1-5`),
  with a backup at 01:13 UTC (`13 1 * * 1-5`)
- weekly, Sunday 09:00 VN = 02:00 UTC Sunday (`0 2 * * 0`)

The only required secret is the repo secret H79_RUN_TOKEN. RENDER_DEPLOY_HOOK is optional and is never printed. This script never prints either secret.
It does not post to Telegram. If the generator quality gate fails, nothing is committed.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
VN = ZoneInfo('Asia/Ho_Chi_Minh')
PEAK_SELL = 191_300_000
PEAK_DATE = '2026-01-29'
VND_RE = re.compile(r'\d{1,3}(?:\.\d{3}){2,3}')
TRIEU_RE = re.compile(r'(\d{1,3})(?:[.,](\d))?\s*triệu', re.I)
DATE_DMY_RE = re.compile(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b')
DATE_ISO_RE = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})\b')
PRICE_TOLERANCE = 200_000
DOMESTIC_PRODUCTS = (
    ('SJL1L10', 'bar', 'SJC miếng'),
    ('SJ9999', 'sjcRing', 'nhẫn SJC'),
    ('PQHN24NTT', 'pnjRing', 'PNJ 24K'),
)


def redact(text):
    raw = text if isinstance(text, str) else str(text)
    for name in ('H79_RUN_TOKEN', 'RENDER_DEPLOY_HOOK'):
        secret = os.environ.get(name) or ''
        if secret:
            raw = raw.replace(secret, '[redacted]')
    return raw


MACRO_CRONS = ('37 23', '52 22', '7 5', '07 5', '17 12')


def task_for_schedule(schedule, forced=''):
    if forced in ('macro', 'domestic', 'weekly'):
        return forced
    text = (schedule or '').strip()
    if any(text.startswith(prefix + ' ') for prefix in MACRO_CRONS):
        return 'macro'
    if text.startswith(('43 1', '43 01', '13 1', '13 01')):
        return 'domestic'
    if text.startswith(('0 2', '00 2', '0 02')):
        return 'weekly'
    return ''


def vn_now(now=None):
    current = now or datetime.now(VN)
    if current.tzinfo is None:
        current = current.replace(tzinfo=VN)
    else:
        current = current.astimezone(VN)
    return current.strftime('%Y-%m-%d %H:%M'), current.strftime('%Y-%m-%d')


def api_base():
    base = (os.environ.get('H79_API_URL') or 'https://h79-ai-server.onrender.com').rstrip('/')
    host = parse_host(base)
    if not base.startswith('https://') and host not in ('127.0.0.1', 'localhost'):
        raise SystemExit('H79_API_URL must be https')
    return base


def parse_host(base):
    return urllib.parse.urlparse(base).hostname or ''


WAKE_LIMIT_S = 600
WAKE_INTERVAL_S = 15
WAKE_TIMEOUT_S = 45
WAKE_HOOK_AFTER_S = 240
ASLEEP_STATUSES = (502, 503)


def deploy_hook(hook):
    """Return an https deploy-hook URL, or '' when it should be skipped."""
    if hook is None:
        hook = os.environ.get('RENDER_DEPLOY_HOOK') or ''
    text = str(hook).strip()
    if not text:
        return ''
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme != 'https' or not parsed.netloc:
        return 'invalid'
    return text


def read_health(open_url, url):
    try:
        with open_url(url, timeout=WAKE_TIMEOUT_S) as response:
            return getattr(response, 'status', 200), ''
    except urllib.error.HTTPError as exc:
        return exc.code, ''
    except Exception as exc:
        return None, exc.__class__.__name__


def send_deploy_hook(open_url, hook_url, say):
    try:
        with open_url(hook_url, timeout=30) as response:
            status = getattr(response, 'status', 200)
        say(f'render deploy hook called ({status})')
    except urllib.error.HTTPError as exc:
        say(f'render deploy hook called ({exc.code})')
    except Exception as exc:
        say(f'render deploy hook failed: {exc.__class__.__name__}')


def wake(base, opener=None, sleep=time.sleep, clock=time.time, log=print, hook=None):
    """Poll /health for up to ten minutes. 502 and 503 mean Render is still asleep.

    When RENDER_DEPLOY_HOOK is set, call that https URL once after about four
    minutes of failures, then keep waiting. The hook URL is never logged.
    """
    url = base.rstrip('/') + '/health'
    open_url = opener or urllib.request.urlopen
    started = clock()
    deadline = started + WAKE_LIMIT_S
    attempt = 0
    hook_sent = False
    hook_url = deploy_hook(hook)

    def say(message):
        text = redact(message)
        if hook_url and hook_url != 'invalid':
            text = text.replace(hook_url, '[redacted]')
        log(text)

    if hook_url == 'invalid':
        say('render deploy hook ignored')
        hook_url = ''
    while True:
        attempt += 1
        status, error_name = read_health(open_url, url)
        if status == 200:
            say(f'generator health ok on attempt {attempt}')
            return
        if status in ASLEEP_STATUSES:
            say(f'generator health attempt {attempt} asleep ({status})')
        elif error_name:
            say(f'generator health attempt {attempt} failed: {error_name}')
        else:
            say(f'generator health attempt {attempt} status {status}')
        if clock() >= deadline:
            raise SystemExit('generator health check failed')
        if hook_url and not hook_sent and clock() - started >= WAKE_HOOK_AFTER_S:
            send_deploy_hook(open_url, hook_url, say)
            hook_sent = True
        sleep(WAKE_INTERVAL_S)


def parse_vn_stamp(text):
    import re
    clock = re.search(r'(\d{1,2}):(\d{2})(?::\d{2})?\s+(\d{1,2})/(\d{1,2})/(\d{4})', text or '')
    if clock:
        return f'{clock.group(5)}-{int(clock.group(4)):02d}-{int(clock.group(3)):02d} {int(clock.group(1)):02d}:{clock.group(2)}'
    iso = re.search(r'(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?', text or '')
    if iso:
        return f'{iso.group(1)}-{iso.group(2)}-{iso.group(3)} {iso.group(4) or "23"}:{iso.group(5) or "59"}'
    return ''


def quotes_before(data, datetime_vn):
    target = parse_vn_stamp(datetime_vn if ':' in (datetime_vn or '') or '/' in (datetime_vn or '') else f'{datetime_vn} 23:59')
    if not target:
        return None
    data = data or {}
    codes = ('SJL1L10', 'PQHN24NTT', 'SJ9999')
    series = {code: [] for code in codes}
    stamp = parse_vn_stamp(data.get('updated_vn') or data.get('price_time') or '')
    rows = data.get('rows') or []
    if stamp and stamp < target:
        for code in codes:
            found = next((item for item in rows if item.get('code') == code and item.get('buy') and item.get('sell')), None)
            if found:
                series[code].append((stamp, {'buy': found['buy'], 'sell': found['sell']}))
    history = data.get('history') or {}
    for code in codes:
        for item in history.get(code) or []:
            at = f"{item['date']} 23:59" if item.get('date') else ''
            if not at or at >= target or not item.get('buy') or not item.get('sell'):
                continue
            series[code].append((at, {'buy': item['buy'], 'sell': item['sell']}))
    def latest(code):
        if not series[code]:
            return None
        return max(series[code], key=lambda item: item[0])[1]
    bar = latest('SJL1L10')
    pnj = latest('PQHN24NTT')
    sjc = latest('SJ9999')
    if not bar and not pnj and not sjc:
        return None
    return {'bar': bar, 'pnjRing': pnj, 'sjcRing': sjc, 'ring': pnj or sjc}


# Three tries spread over about five minutes: immediate, then 90s, then 150s.
POST_RETRY_WAITS = (90, 150)
POST_TIMEOUT_S = 180


def post_board(base, task, datetime_vn, opener=None, previous=None, sleep=time.sleep):
    token = os.environ.get('H79_RUN_TOKEN') or ''
    if not token:
        raise SystemExit('H79_RUN_TOKEN is not set')
    body_payload = {'task': task, 'datetime_vn': datetime_vn}
    if previous:
        body_payload['previous'] = previous
    body = json.dumps(body_payload).encode()
    open_url = opener or urllib.request.urlopen
    last = 'unreachable'
    for attempt in range(3):
        if attempt:
            sleep(POST_RETRY_WAITS[attempt - 1])
        req = urllib.request.Request(base + '/api/boards', data=body, method='POST', headers={
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })
        try:
            with open_url(req, timeout=POST_TIMEOUT_S) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code == 429 or 500 <= exc.code <= 599:
                last = exc.code
                continue
            print(redact(f'generator HTTP {exc.code}: {generator_reason(exc)}'))
            raise SystemExit(f'generator HTTP {exc.code}')
        except (urllib.error.URLError, TimeoutError, OSError):
            last = 'timeout'
            continue
        if not isinstance(payload, dict) or not payload.get('ok') or not payload.get('board'):
            raise SystemExit('generator rejected the draft')
        return payload
    raise SystemExit(f'generator failed after 3 tries ({last})')


def generator_reason(exc):
    """Short, secret-free reason from a generator 4xx body (error text and debug summary)."""
    try:
        raw = exc.read() if hasattr(exc, 'read') else b''
        data = json.loads(raw.decode('utf-8', 'replace') or '{}') if raw else {}
    except Exception:
        return 'no details'
    if not isinstance(data, dict):
        return 'no details'
    debug = data.get('debug') if isinstance(data.get('debug'), dict) else {}
    parts = [str(data.get('error') or '')[:200]]
    if debug.get('detail'):
        parts.append(f"detail={str(debug['detail'])[:120]}")
    for key in ('failedNumbers', 'missingFacts', 'flagged'):
        value = debug.get(key)
        if isinstance(value, list) and value:
            parts.append(f'{key}={len(value)}: ' + '; '.join(str(item)[:80] for item in value[:3]))
    text = ' | '.join(part for part in parts if part)
    return text or 'no details'


def read_json(path, fallback):
    file = Path(path)
    if not file.exists():
        return fallback
    return json.loads(file.read_text(encoding='utf-8'))


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


def macro_done(root, date):
    data = read_json(Path(root) / 'data' / 'macro-news.json', {'items': []})
    if any(item.get('date') == date for item in data.get('items', [])):
        return True
    return (Path(root) / 'bai' / f'{date}-tin-vi-mo-anh-huong-gia-vang.html').exists()


# Macro slots by VN hour when the run actually starts. 00:00–04:59 is no slot:
# that is a previous evening run GitHub pushed past midnight.
MACRO_SLOTS = (('sang', 5, 11), ('trua', 11, 17), ('toi', 17, 24))
MACRO_MIN_GAP_MIN = 180
SIMILAR = 0.6


def macro_slot(now_vn):
    hour = now_vn.hour
    for name, start, end in MACRO_SLOTS:
        if start <= hour < end:
            return name
    return ''


def item_published(item):
    """'YYYY-MM-DD HH:MM' when this macro item went up. Old items carry it only inside time_vn."""
    if item.get('published_vn'):
        return item['published_vn']
    match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})', item.get('time_vn') or '')
    if match and f'{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d}' == item.get('date'):
        return f'{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d} {int(match.group(4)):02d}:{match.group(5)}'
    return f"{item.get('date')} 06:00"


def minutes_between(earlier, later):
    fmt = '%Y-%m-%d %H:%M'
    return (datetime.strptime(later, fmt) - datetime.strptime(earlier, fmt)).total_seconds() / 60


def macro_gate(root, date, datetime_vn, slot):
    """Return (go, first, reason). first=True means no macro update exists yet for this VN date."""
    if not slot:
        return False, False, 'no macro slot between 00:00 and 05:00 VN'
    data = read_json(Path(root) / 'data' / 'macro-news.json', {'items': []})
    today = [item for item in data.get('items', []) if item.get('date') == date]
    if not today:
        if (Path(root) / 'bai' / f'{date}-tin-vi-mo-anh-huong-gia-vang.html').exists():
            return False, False, f'macro {date} already published'
        return True, True, f'macro {date} first update ({slot})'
    used = {item.get('slot') or 'sang' for item in today}
    if slot in used:
        return False, False, f'macro {date} slot {slot} already published'
    last = max(item_published(item) for item in today)
    gap = minutes_between(last, datetime_vn)
    if gap < MACRO_MIN_GAP_MIN:
        return False, False, f'macro {date} last update {last}, only {int(gap)} min ago'
    return True, False, f'macro {date} extra update ({slot})'


def words(text):
    return {word for word in re.findall(r'\w+', (text or '').lower()) if len(word) > 1}


def similar(a, b):
    left, right = words(a), words(b)
    if not left or not right:
        return False
    return len(left & right) / len(left | right) >= SIMILAR


def item_urls(item):
    return {(item.get(key) or {}).get('url') for key in ('source', 'source2') if (item.get(key) or {}).get('url')}


def is_repeat(new, earlier):
    """A story is a repeat when it cites the same article or reads like an earlier title or summary."""
    seen_urls = set()
    for old in earlier:
        seen_urls |= item_urls(old)
    if (new.get('source') or {}).get('url') in seen_urls:
        return True
    for old in earlier:
        for key in ('title', 'title_en', 'summary', 'summary_en'):
            if similar(new.get(key), old.get(key)):
                return True
    return False


def recent_macro(items, date):
    """Items of this VN date plus the latest earlier date, the stories a later update must not repeat."""
    earlier_dates = sorted({item.get('date') for item in items if item.get('date') and item.get('date') < date})
    keep = {date}
    if earlier_dates:
        keep.add(earlier_dates[-1])
    return [item for item in items if item.get('date') in keep]


def domestic_done(root, date):
    return (Path(root) / 'bai' / f'{date}-gia-vang-trong-nuoc.html').exists()


def weekly_done(root, date):
    data = read_json(Path(root) / 'data' / 'strategies.json', {'strategies': []})
    if any(item.get('id') == f'{date}-tong-hop-tin-vang' for item in data.get('strategies', [])):
        return True
    return (Path(root) / 'bai' / f'{date}-tong-hop-tin-vang-tuan-qua.html').exists()


def already_published(root, task, date):
    if task == 'macro':
        return macro_done(root, date)
    if task == 'domestic':
        return domestic_done(root, date)
    if task == 'weekly':
        return weekly_done(root, date)
    return False


def apply_macro(data, payload, slot='', published_vn=''):
    """Prepend this run's stories. Without a slot, a date that already has stories is left alone.

    With a slot (sang/trua/toi), a later update of the same date is added on top of the
    earlier ones; stories that repeat today's or the previous day's board are dropped.
    Earlier stories are never changed or removed.
    """
    clock = payload['clock']
    date = clock['dateVn']
    items = data.setdefault('items', [])
    has_today = any(item.get('date') == date for item in items)
    if has_today and not slot:
        return False
    earlier = recent_macro(items, date) if has_today else []
    published_vn = published_vn or f"{date} {clock['timeVn']}"
    sources = [src for src in payload.get('sources') or [] if src.get('url')]
    by_url = {src['url']: src for src in sources}
    new_items = []
    for raw in payload['board'].get('items') or []:
        url = raw.get('source_url') or (sources[0]['url'] if sources else '')
        src = by_url.get(url) or (sources[0] if sources else None)
        if not src or not raw.get('title'):
            continue
        item = {
            'date': date,
            'category': raw.get('category') or 'Vàng',
            'priority': 1,
            'impact': raw.get('impact') if raw.get('impact') in ('tăng', 'giảm', 'trung lập') else 'trung lập',
            'title': raw['title'],
            'summary': raw.get('summary') or '',
            'reason': raw.get('reason') or '',
            'source': {'name': src.get('name') or 'Nguồn', 'name_en': src.get('name') or 'Source', 'url': src['url']},
            'time_vn': raw.get('time_vn') or f"{clock['weekdayVn']} {date} {clock['timeVn']} giờ VN",
            'title_en': raw.get('title_en') or '',
            'summary_en': raw.get('summary_en') or '',
            'reason_en': raw.get('reason_en') or '',
            'time_en': clock['timeEn'],
        }
        if len(sources) > 1 and sources[1]['url'] != src['url']:
            item['source2'] = {'name': sources[1].get('name') or 'Nguồn', 'name_en': sources[1].get('name') or 'Source', 'url': sources[1]['url']}
        if slot:
            item['slot'] = slot
            item['published_vn'] = published_vn
        if earlier and is_repeat(item, earlier + new_items):
            continue
        new_items.append(item)
    if not new_items:
        return False
    data['items'] = new_items + items
    data['updated'] = date
    return True


def apply_fedwatch(data, payload):
    fed = payload.get('fedwatch') or {}
    items = fed.get('items') or []
    if not fed.get('stated') or not items:
        return False
    clock = payload['clock']
    year, month, day = clock['dateVn'].split('-')
    first = items[0]
    if not first.get('url'):
        return False
    data['updated_vn'] = f"{clock['timeVn']} {day}/{month}/{year} (UTC+7)"
    data['as_of_note'] = ' '.join(item.get('sentence') or '' for item in items)[:800]
    data['source'] = {'name': first.get('name') or 'Nguồn', 'url': first['url'], 'name_en': first.get('name') or 'Source'}
    return True


def vnd_amounts(text):
    found = set()
    for match in VND_RE.finditer(text or ''):
        found.add(int(match.group(0).replace('.', '')))
    for match in TRIEU_RE.finditer(text or ''):
        frac = int(match.group(2)) * 100_000 if match.group(2) else 0
        found.add(int(match.group(1)) * 1_000_000 + frac)
    return {amount for amount in found if amount >= 1_000_000}


def as_int(value):
    try:
        amount = int(round(float(value)))
    except (TypeError, ValueError):
        return 0
    return amount if amount > 0 else 0


def add_amount(allowed, value):
    amount = as_int(value)
    if amount:
        allowed.add(amount)


def amount_allowed(amount, allowed):
    if amount in allowed:
        return True
    return any(abs(amount - item) <= PRICE_TOLERANCE for item in allowed)


def prose_ok(text, allowed):
    amounts = vnd_amounts(text)
    return bool(amounts) and all(amount_allowed(amount, allowed) for amount in amounts)


def mentioned_dates(text, year):
    found = set()
    for match in DATE_ISO_RE.finditer(text or ''):
        found.add(f'{match.group(1)}-{match.group(2)}-{match.group(3)}')
    for match in DATE_DMY_RE.finditer(text or ''):
        day, month = int(match.group(1)), int(match.group(2))
        if not (1 <= day <= 31 and 1 <= month <= 12):
            continue
        found.add(f'{int(match.group(3) or year):04d}-{month:02d}-{day:02d}')
    return found


def dates_ok(text, allowed, year):
    return mentioned_dates(text, year) <= allowed


def line_ok(text, allowed, dates, year):
    return isinstance(text, str) and prose_ok(text, allowed) and dates_ok(text, dates, year)


def row_by_code(rows, code):
    return next((row for row in rows or [] if row.get('code') == code and row.get('buy') and row.get('sell')), None)


def allowed_prices(rows):
    allowed = set()
    for row in rows or []:
        for key in ('buy', 'sell', 'prev_buy', 'prev_sell'):
            add_amount(allowed, row.get(key))
        for key in ('chg_buy', 'chg_sell'):
            add_amount(allowed, abs(as_int(row.get(key))))
        buy, prev_buy = as_int(row.get('buy')), as_int(row.get('prev_buy'))
        sell, prev_sell = as_int(row.get('sell')), as_int(row.get('prev_sell'))
        if buy and prev_buy:
            add_amount(allowed, abs(buy - prev_buy))
        if sell and prev_sell:
            add_amount(allowed, abs(sell - prev_sell))
    return allowed


def derived_amounts(data, rows, payload):
    """Row prices plus world conversion, premium, like-for-like deltas, and the peak."""
    allowed = allowed_prices(rows)
    data = data or {}
    world = data.get('world') or {}
    payload = payload or {}
    market = payload.get('market') or {}
    converted = as_int(world.get('vnd_per_luong') or market.get('vnd_per_luong') or market.get('converted'))
    add_amount(allowed, converted)
    add_amount(allowed, world.get('gap_sjc_sell'))
    add_amount(allowed, market.get('gap') or market.get('premium'))
    add_amount(allowed, PEAK_SELL)
    peak = data.get('peak') or {}
    add_amount(allowed, peak.get('buy'))
    add_amount(allowed, peak.get('sell'))
    previous = payload.get('previous') or {}
    for code, key, _label in DOMESTIC_PRODUCTS:
        row = row_by_code(rows, code)
        quote = previous.get(key) or {}
        add_amount(allowed, quote.get('buy'))
        add_amount(allowed, quote.get('sell'))
        if not row:
            continue
        if converted and code == 'SJL1L10':
            add_amount(allowed, abs(as_int(row.get('sell')) - converted))
            add_amount(allowed, abs(as_int(row.get('buy')) - converted))
        add_amount(allowed, abs(PEAK_SELL - as_int(row.get('buy'))))
        add_amount(allowed, abs(PEAK_SELL - as_int(row.get('sell'))))
        if quote.get('buy'):
            add_amount(allowed, abs(as_int(row.get('buy')) - as_int(quote.get('buy'))))
        if quote.get('sell'):
            add_amount(allowed, abs(as_int(row.get('sell')) - as_int(quote.get('sell'))))
    bar = row_by_code(rows, 'SJL1L10')
    for item in (data.get('sjc_compare') or {}).values():
        if not isinstance(item, dict):
            continue
        add_amount(allowed, item.get('buy'))
        add_amount(allowed, item.get('sell'))
        if not bar:
            continue
        if item.get('buy'):
            add_amount(allowed, abs(as_int(bar.get('buy')) - as_int(item.get('buy'))))
        if item.get('sell'):
            add_amount(allowed, abs(as_int(bar.get('sell')) - as_int(item.get('sell'))))
    for line in (payload.get('board') or {}).get('price_lines') or []:
        allowed.update(vnd_amounts(line))
    return allowed


def allowed_dates(data, rows, payload):
    dates = {PEAK_DATE, (payload.get('clock') or {}).get('dateVn') or ''}
    dates.discard('')
    for row in rows or []:
        if row.get('prev_date'):
            dates.add(row['prev_date'])
    for item in ((data or {}).get('sjc_compare') or {}).values():
        if isinstance(item, dict) and item.get('date'):
            dates.add(item['date'])
    return dates


def fmt_vnd(amount):
    return f'{as_int(amount):,}'.replace(',', '.')


def fmt_trieu(amount):
    scaled = int(round(as_int(amount) / 100_000))
    whole, tenth = divmod(scaled, 10)
    if tenth:
        return f'{whole},{tenth} triệu'
    return f'{whole} triệu'


def quote_sentence(label, row):
    if not row:
        return ''
    line = f"{label} mua {fmt_vnd(row['buy'])} / bán {fmt_vnd(row['sell'])}"
    delta = 0
    try:
        if row.get('chg_sell') is not None:
            delta = int(round(float(row.get('chg_sell'))))
    except (TypeError, ValueError):
        delta = 0
    if not delta and row.get('prev_sell'):
        delta = as_int(row.get('sell')) - as_int(row.get('prev_sell'))
    if delta:
        line += f", bán {'tăng' if delta > 0 else 'giảm'} {fmt_vnd(abs(delta))}"
    return line


def domestic_fallback(data, rows):
    parts = []
    for code, _key, label in DOMESTIC_PRODUCTS:
        sentence = quote_sentence(label, row_by_code(rows, code))
        if sentence:
            parts.append(sentence)
    if not parts:
        for row in rows or []:
            if row.get('buy') and row.get('sell'):
                parts.append(quote_sentence(row.get('type') or 'Giá', row))
                break
    world = (data or {}).get('world') or {}
    converted = as_int(world.get('vnd_per_luong'))
    bar = row_by_code(rows, 'SJL1L10')
    premium = as_int(world.get('gap_sjc_sell'))
    if not premium and bar and converted:
        premium = abs(as_int(bar.get('sell')) - converted)
    if converted:
        parts.append(f'Giá thế giới quy đổi {fmt_trieu(converted)} đồng/lượng')
    if premium:
        parts.append(f'Chênh SJC bán so với quy đổi {fmt_trieu(premium)}')
    if not parts:
        return 'Chưa đủ giá trong ngày để viết nhận định.'
    return '. '.join(parts) + '.'


def keep_peak(peak, rows, date):
    current = peak or {}
    best = None
    for row in rows or []:
        sell = int(row.get('sell') or 0)
        if sell > PEAK_SELL and row.get('src_url') and (best is None or sell > int(best.get('sell') or 0)):
            best = row
    if not best:
        return peak
    if current.get('date') and current.get('date') >= date and int(current.get('sell') or 0) >= int(best['sell']):
        return peak
    return {
        'label': 'Đỉnh lịch sử vàng miếng SJC',
        'label_en': 'SJC bar all-time high',
        'buy': best.get('buy'),
        'sell': int(best['sell']),
        'date': date,
        'note': f"Bán {int(best['sell'])} cao hơn đỉnh 191,3 triệu ngày 29/01/2026.",
        'note_en': f"Ask {int(best['sell'])} is above the Jan 29, 2026 record of 191.3 million VND per tael.",
        'source': {'name': best.get('src_name') or best.get('brand') or 'Nguồn', 'url': best['src_url']},
    }


def accepted_refs(board, allowed, dates, year):
    refs = []
    for ref in board.get('refs') or []:
        url = ref.get('url') or ''
        facts = []
        for fact in ref.get('facts') or []:
            if not isinstance(fact, str) or not dates_ok(fact, dates, year):
                continue
            amounts = vnd_amounts(fact)
            if amounts and not all(amount_allowed(amount, allowed) for amount in amounts):
                continue
            facts.append(fact)
        if url.startswith('https://') and facts:
            refs.append({
                'name': ref.get('name') or 'Nguồn',
                'url': url,
                'facts': facts,
                'name_en': ref.get('name_en') or ref.get('name') or '',
                'facts_en': ref.get('facts_en') or [],
            })
    return refs


def apply_domestic_prose(data, payload, rows):
    board = payload.get('board') or {}
    year = (payload.get('clock') or {}).get('dateVn', '2026-01-01').split('-')[0]
    allowed = derived_amounts(data, rows, payload)
    dates = allowed_dates(data, rows, payload)
    analysis = [line for line in (board.get('analysis') or []) if line_ok(line, allowed, dates, year)]
    advice = board.get('advice') if line_ok(board.get('advice'), allowed, dates, year) else ''
    quick = board.get('quick_advice') if line_ok(board.get('quick_advice'), allowed, dates, year) else ''
    analysis_en = [line for line in (board.get('analysis_en') or []) if line_ok(line, allowed, dates, year)]
    advice_en = board.get('advice_en') if line_ok(board.get('advice_en'), allowed, dates, year) else ''
    quick_en = board.get('quick_advice_en') if line_ok(board.get('quick_advice_en'), allowed, dates, year) else ''
    if analysis and advice:
        data['analysis'] = analysis
        data['advice'] = advice
        data['quick_advice'] = quick or analysis[0]
        if analysis_en:
            data['analysis_en'] = analysis_en
        if advice_en:
            data['advice_en'] = advice_en
        if quick_en:
            data['quick_advice_en'] = quick_en
        data['refs'] = accepted_refs(board, allowed, dates, year)
    else:
        fallback = domestic_fallback(data, rows)
        print('warning: domestic prose was not accepted; wrote today\'s prices and dropped stale refs')
        data['analysis'] = [fallback]
        data['advice'] = fallback
        data['quick_advice'] = fallback
        data['refs'] = []
    news = []
    for item in board.get('world_news') or []:
        text = item.get('text') or ''
        source = item.get('source') or {}
        url = source.get('url') or ''
        amounts = vnd_amounts(text)
        if not url.startswith('https://') or not dates_ok(text, dates, year):
            continue
        if amounts and not all(amount_allowed(amount, allowed) for amount in amounts):
            continue
        host = urllib.request.urlparse(url).hostname or ''
        news.append({
            'text': text,
            'source': {'name': source.get('name') or 'Nguồn', 'url': url},
            'intl': any(name in host for name in ('cnbc.com', 'reuters.com', 'kitco.com', 'bloomberg.com')),
        })
    if news:
        data['world_news'] = news
    date = payload['clock']['dateVn']
    kept = keep_peak(data.get('peak'), rows, date)
    if kept != data.get('peak'):
        data['peak'] = kept
    elif 'peak' not in data and kept:
        data['peak'] = kept
    return True


def weekly_entry(payload):
    clock = payload['clock']
    date = clock['dateVn']
    board = payload['board']
    sources = [{'name': src.get('name') or 'Nguồn', 'url': src['url']} for src in payload.get('sources') or [] if src.get('url')]
    return {
        'id': f'{date}-tong-hop-tin-vang',
        'date': date,
        'news': True,
        'session': 'Tổng hợp tin vàng tuần qua',
        'session_en': 'Week in review',
        'url': f'bai/{date}-tong-hop-tin-vang-tuan-qua.html',
        'url_en': f'en/posts/{date}-gold-week-news-recap.html',
        'title': board.get('title') or '',
        'title_en': board.get('title_en') or '',
        'headline': board.get('title') or '',
        'headline_en': board.get('title_en') or '',
        'article': {'title': board.get('title') or '', 'sections': board.get('sections') or [], 'sources': sources},
        'article_en': {'title': board.get('title_en') or '', 'sections': board.get('sections_en') or [], 'sources': sources},
        'disclaimer': 'Bản tin, không phải kế hoạch giao dịch.',
        'disclaimer_en': 'News digest, not a trade plan.',
    }


def apply_weekly(data, payload):
    entry = weekly_entry(payload)
    if not entry['title'] or not entry['article']['sections']:
        return False
    rows = data.setdefault('strategies', [])
    if any(item.get('id') == entry['id'] for item in rows):
        return False
    data['strategies'] = [entry] + rows
    return True


def apply_share(data, task, payload):
    board = payload.get('board') or {}
    clock = payload['clock']
    out = dict(data or {})
    out[task] = {'date': clock['dateVn'], 'facebook': board.get('share_fb') or '', 'zalo': board.get('share_zalo') or ''}
    return out


def commit_and_push(message, runner=subprocess.run):
    if os.environ.get('GITHUB_ACTIONS') != 'true' and os.environ.get('H79_PUSH') != '1':
        return False
    add = ['git', 'add', '--', 'data/macro-news.json', 'data/fedwatch.json', 'data/vn-gold-daily.json', 'data/vn-gold-history.json', 'data/strategies.json', 'data/latest-share.json', 'bai', 'en/posts', 'sitemap.xml', 'robots.txt', 'index.html']
    runner(add, cwd=ROOT, check=True)
    quiet = runner(['git', 'diff', '--cached', '--quiet'], cwd=ROOT)
    if quiet.returncode == 0:
        return False
    runner(['git', '-c', 'user.name=PROT1407', '-c', 'user.email=201034500+PROT1407@users.noreply.github.com', 'commit', '-m', message], cwd=ROOT, check=True)
    runner(['git', 'pull', '--rebase', 'origin', 'main'], cwd=ROOT, check=True)
    runner(['git', 'push', 'origin', 'HEAD:main'], cwd=ROOT, check=True)
    return True


def apply_payload(root, task, payload, slot='', published_vn=''):
    root = Path(root)
    changed = False
    if task == 'macro':
        macro_path = root / 'data' / 'macro-news.json'
        macro = read_json(macro_path, {'items': []})
        if not apply_macro(macro, payload, slot=slot, published_vn=published_vn):
            return False
        write_json(macro_path, macro)
        changed = True
        fed_path = root / 'data' / 'fedwatch.json'
        if fed_path.exists():
            fed = read_json(fed_path, {})
            if apply_fedwatch(fed, payload):
                write_json(fed_path, fed)
                changed = True
    elif task == 'domestic':
        gold_path = root / 'data' / 'vn-gold-daily.json'
        gold = read_json(gold_path, {})
        if apply_domestic_prose(gold, payload, gold.get('rows') or []):
            write_json(gold_path, gold)
            changed = True
    elif task == 'weekly':
        strat_path = root / 'data' / 'strategies.json'
        strat = read_json(strat_path, {'strategies': []})
        if apply_weekly(strat, payload):
            write_json(strat_path, strat)
            changed = True
    share_path = root / 'data' / 'latest-share.json'
    share = apply_share(read_json(share_path, {}), task, payload)
    write_json(share_path, share)
    return True


def main(argv=None):
    forced = ''
    if argv is None:
        argv = sys.argv[1:]
    if argv and argv[0] in ('macro', 'domestic', 'weekly'):
        forced = argv[0]
    manual = os.environ.get('H79_TASK') or forced
    task = task_for_schedule(os.environ.get('GITHUB_EVENT_SCHEDULE', ''), manual)
    if not task:
        print('missing task')
        return 1
    now = datetime.now(VN)
    datetime_vn, date = vn_now(now)
    print(f'{task} datetime_vn={datetime_vn}')
    slot = ''
    if task == 'macro':
        slot = macro_slot(now)
        if manual:
            slot = slot or 'sang'
        elif now.weekday() >= 5:
            print(f'macro {date} is a weekend day in VN, skipped')
            return 0
        go, _first, reason = macro_gate(ROOT, date, datetime_vn, slot)
        print(reason)
        if not go:
            return 0
    elif already_published(ROOT, task, date):
        print(f'{task} {date} already published')
        return 0
    base = api_base()
    wake(base)
    previous = None
    if task == 'domestic':
        previous = quotes_before(read_json(ROOT / 'data' / 'vn-gold-daily.json', {}), datetime_vn)
    payload = post_board(base, task, datetime_vn, previous=previous)
    if task == 'domestic':
        result = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'update-vn-gold.py')], cwd=ROOT)
        if result.returncode != 0:
            subprocess.run(['git', 'checkout', '--', 'data/vn-gold-daily.json', 'data/vn-gold-history.json'], cwd=ROOT)
            print('price update failed')
            return 1
    if not apply_payload(ROOT, task, payload, slot=slot, published_vn=datetime_vn):
        print(f'{task} {date} {slot}: no new stories, nothing published')
        return 0
    seo = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'build-seo.py')], cwd=ROOT)
    if seo.returncode != 0:
        print('build-seo failed')
        return 1
    label = f'{task} {date}' + (f' {slot}' if slot else '')
    commit_and_push(f'H79 {label}')
    print(f'published {label}')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(redact(exc.__class__.__name__))
        raise SystemExit(1)

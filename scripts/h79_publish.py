#!/usr/bin/env python3
"""Publish H79 boards without Grok Bot.

Vietnam is UTC+7 all year. The workflow clocks are:

- macro, weekdays 06:37 VN = 23:37 UTC the previous calendar day (`37 23 * * 0-4`)
- domestic, weekdays 08:43 VN = 01:43 UTC the same weekday (`43 1 * * 1-5`)
- weekly, Sunday 09:00 VN = 02:00 UTC Sunday (`0 2 * * 0`)

The only secret is the repo secret H79_RUN_TOKEN. This script never prints it.
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
TRIEU_RE = re.compile(r'(\d{2,3})(?:[.,](\d))?\s*triệu', re.I)


def redact(text):
    raw = text if isinstance(text, str) else str(text)
    token = os.environ.get('H79_RUN_TOKEN') or ''
    if token:
        raw = raw.replace(token, '[redacted]')
    return raw


def task_for_schedule(schedule, forced=''):
    if forced in ('macro', 'domestic', 'weekly'):
        return forced
    text = (schedule or '').strip()
    if text.startswith('37 23'):
        return 'macro'
    if text.startswith('43 1') or text.startswith('43 01'):
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


def wake(base, opener=None, sleep=time.sleep):
    url = base + '/health'
    open_url = opener or urllib.request.urlopen
    deadline = time.time() + 90
    while True:
        try:
            with open_url(url, timeout=20) as response:
                if getattr(response, 'status', 200) == 200:
                    return
        except Exception:
            pass
        if time.time() >= deadline:
            raise SystemExit('generator health check failed')
        sleep(3)


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
    snapshots = []
    stamp = parse_vn_stamp(data.get('updated_vn') or data.get('price_time') or '')
    rows = data.get('rows') or []
    def row(code):
        found = next((item for item in rows if item.get('code') == code and item.get('buy') and item.get('sell')), None)
        return {'buy': found['buy'], 'sell': found['sell']} if found else None
    if stamp and stamp < target:
        snapshots.append({'at': stamp, 'bar': row('SJL1L10'), 'ring': row('PQHN24NTT') or row('SJ9999')})
    history = data.get('history') or {}
    dated = {}
    for code in ('SJL1L10', 'PQHN24NTT', 'SJ9999'):
        for item in history.get(code) or []:
            at = f"{item['date']} 23:59" if item.get('date') else ''
            if not at or at >= target or not item.get('buy') or not item.get('sell'):
                continue
            dated.setdefault(at, {})[code] = {'buy': item['buy'], 'sell': item['sell']}
    for at, codes in dated.items():
        snapshots.append({'at': at, 'bar': codes.get('SJL1L10'), 'ring': codes.get('PQHN24NTT') or codes.get('SJ9999')})
    if not snapshots:
        return None
    latest = max(snapshots, key=lambda item: item['at'])
    if not latest.get('bar') and not latest.get('ring'):
        return None
    return {'bar': latest.get('bar'), 'ring': latest.get('ring')}


def post_board(base, task, datetime_vn, opener=None, previous=None):
    token = os.environ.get('H79_RUN_TOKEN') or ''
    if not token:
        raise SystemExit('H79_RUN_TOKEN is not set')
    payload = {'task': task, 'datetime_vn': datetime_vn}
    if previous:
        payload['previous'] = previous
    body = json.dumps(payload).encode()
    req = urllib.request.Request(base + '/api/boards', data=body, method='POST', headers={
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    })
    open_url = opener or urllib.request.urlopen
    try:
        with open_url(req, timeout=100) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f'generator HTTP {exc.code}')
    if not isinstance(payload, dict) or not payload.get('ok') or not payload.get('board'):
        raise SystemExit('generator rejected the draft')
    return payload


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


def apply_macro(data, payload):
    clock = payload['clock']
    date = clock['dateVn']
    items = data.setdefault('items', [])
    if any(item.get('date') == date for item in items):
        return False
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
    return {amount for amount in found if amount >= 50_000_000}


def prose_ok(text, allowed):
    amounts = vnd_amounts(text)
    return bool(amounts) and amounts <= allowed


def allowed_prices(rows):
    allowed = set()
    for row in rows or []:
        for key in ('buy', 'sell'):
            if row.get(key):
                allowed.add(int(row[key]))
    return allowed


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


def apply_domestic_prose(data, payload, rows):
    allowed = allowed_prices(rows)
    board = payload.get('board') or {}
    changed = False
    for key in ('analysis', 'analysis_en'):
        lines = [line for line in (board.get(key) or []) if isinstance(line, str) and prose_ok(line, allowed)]
        if lines:
            data[key] = lines
            changed = True
    for key in ('advice', 'advice_en', 'quick_advice', 'quick_advice_en'):
        text = board.get(key)
        if isinstance(text, str) and prose_ok(text, allowed):
            data[key] = text
            changed = True
    refs = []
    for ref in board.get('refs') or []:
        url = ref.get('url') or ''
        facts = [fact for fact in (ref.get('facts') or []) if isinstance(fact, str) and (prose_ok(fact, allowed) or not vnd_amounts(fact))]
        if url.startswith('https://') and facts and all(not vnd_amounts(fact) or prose_ok(fact, allowed) for fact in facts):
            refs.append({
                'name': ref.get('name') or 'Nguồn',
                'url': url,
                'facts': facts,
                'name_en': ref.get('name_en') or ref.get('name') or '',
                'facts_en': ref.get('facts_en') or [],
            })
    if refs:
        data['refs'] = refs
        changed = True
    news = []
    for item in board.get('world_news') or []:
        text = item.get('text') or ''
        source = item.get('source') or {}
        url = source.get('url') or ''
        amounts = vnd_amounts(text)
        if not url.startswith('https://') or (amounts and not amounts <= allowed):
            continue
        host = urllib.request.urlparse(url).hostname or ''
        news.append({
            'text': text,
            'source': {'name': source.get('name') or 'Nguồn', 'url': url},
            'intl': any(name in host for name in ('cnbc.com', 'reuters.com', 'kitco.com', 'bloomberg.com')),
        })
    if news:
        data['world_news'] = news
        changed = True
    date = payload['clock']['dateVn']
    kept = keep_peak(data.get('peak'), rows, date)
    if kept != data.get('peak'):
        data['peak'] = kept
        changed = True
    elif 'peak' not in data and kept:
        data['peak'] = kept
    return changed


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


def apply_payload(root, task, payload):
    root = Path(root)
    changed = False
    if task == 'macro':
        macro_path = root / 'data' / 'macro-news.json'
        macro = read_json(macro_path, {'items': []})
        if apply_macro(macro, payload):
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
    return changed or True


def main(argv=None):
    forced = ''
    if argv is None:
        argv = sys.argv[1:]
    if argv and argv[0] in ('macro', 'domestic', 'weekly'):
        forced = argv[0]
    task = task_for_schedule(os.environ.get('GITHUB_EVENT_SCHEDULE', ''), os.environ.get('H79_TASK') or forced)
    if not task:
        print('missing task')
        return 1
    datetime_vn, date = vn_now()
    if already_published(ROOT, task, date):
        print(f'{task} {date} already published')
        return 0
    base = api_base()
    wake(base)
    previous = None
    if task == 'domestic':
        previous = quotes_before(read_json(ROOT / 'data' / 'vn-gold-daily.json', {}), date)
    payload = post_board(base, task, datetime_vn, previous=previous)
    if task == 'domestic':
        result = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'update-vn-gold.py')], cwd=ROOT)
        if result.returncode != 0:
            subprocess.run(['git', 'checkout', '--', 'data/vn-gold-daily.json', 'data/vn-gold-history.json'], cwd=ROOT)
            print('price update failed')
            return 1
    apply_payload(ROOT, task, payload)
    seo = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'build-seo.py')], cwd=ROOT)
    if seo.returncode != 0:
        print('build-seo failed')
        return 1
    commit_and_push(f'H79 {task} {date}')
    print(f'published {task} {date}')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(redact(exc.__class__.__name__))
        raise SystemExit(1)

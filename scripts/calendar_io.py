"""Đọc/ghi data/calendar-us.json. Không ghi file trống hoặc sai cấu trúc."""
import json, os, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'calendar-us.json'
REQUIRED_EVENT = (
    'title', 'title_vi', 'explain', 'explain_en', 'impact', 'time_utc', 'time_vn',
    'date_vn', 'forecast', 'previous', 'actual',
)
_TIME_UTC = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z')
_DATE = re.compile(r'\d{4}-\d{2}-\d{2}')
_UPDATED_VN = re.compile(r'\d{2}:\d{2} \d{2}/\d{2}/\d{4}')


def render(doc):
    return json.dumps(doc, ensure_ascii=False, indent=1)


def validate_calendar(doc):
    """Raise ValueError when the document must not be committed."""
    if not isinstance(doc, dict):
        raise ValueError('calendar không phải object')
    if not isinstance(doc.get('_ghi_chu'), str) or not doc['_ghi_chu'].strip():
        raise ValueError('thiếu ghi chú')
    src = doc.get('source')
    if not isinstance(src, dict):
        raise ValueError('thiếu source')
    for key in ('name', 'url', 'feed'):
        if not isinstance(src.get(key), str) or not src[key].strip():
            raise ValueError(f'thiếu source.{key}')
    if not _UPDATED_VN.fullmatch(doc.get('updated_vn') or ''):
        raise ValueError('updated_vn sai')
    if not _TIME_UTC.fullmatch(doc.get('updated_utc') or ''):
        raise ValueError('updated_utc sai')
    events = doc.get('events')
    if not isinstance(events, list) or not events:
        raise ValueError('file lịch trống hoặc events không hợp lệ')
    if not isinstance(doc.get('has_actual'), bool):
        raise ValueError('has_actual phải là bool')
    if doc['has_actual'] != any(bool(e.get('actual')) for e in events):
        raise ValueError('has_actual không khớp số thực tế')
    for event in events:
        if not isinstance(event, dict):
            raise ValueError('event không phải object')
        for key in REQUIRED_EVENT:
            if key not in event or not isinstance(event[key], str):
                raise ValueError(f'thiếu {key} ở {event.get("title")!r}')
        if event['impact'] != 'High':
            raise ValueError(f'impact không phải High: {event["title"]}')
        if not _TIME_UTC.fullmatch(event['time_utc']):
            raise ValueError(f'time_utc sai: {event["time_utc"]}')
        if not _DATE.fullmatch(event['date_vn']):
            raise ValueError(f'date_vn sai: {event["date_vn"]}')
    return doc


def atomic_write(path, text):
    path = Path(path)
    if not isinstance(text, str) or not text.strip():
        raise ValueError('từ chối ghi file rỗng')
    validate_calendar(json.loads(text))
    tmp = path.with_name(path.name + '.tmp')
    try:
        tmp.write_text(text, encoding='utf-8')
        os.replace(tmp, path)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise

#!/usr/bin/env python3
"""Cảnh báo tin đỏ Mỹ (High impact) trước giờ ra tin: Telegram + (tùy chọn) OneSignal.

Chạy bởi .github/workflows/red-news-alert.yml mỗi 5 phút. Cửa sổ: 0 < phút tới tin <= WINDOW_MIN
(mặc định 20, chịu được cron GitHub trễ vài phút). Chống trùng: state file (ALERT_STATE,
mặc định data/alert-state.json) lưu khóa = time_utc đã gửi; workflow giữ file qua actions/cache.
Tin Telegram: khối English/ET trước, khối tiếng Việt sau (một tin song ngữ).
Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ONESIGNAL_APP_ID, ONESIGNAL_REST_KEY, DRY_RUN=1, NOW_UTC (test).
"""
import json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

CAL = os.environ.get("CALENDAR", "data/calendar-us.json")
STATE = os.environ.get("ALERT_STATE", "data/alert-state.json")
WINDOW = float(os.environ.get("WINDOW_MIN", "20"))
DRY = os.environ.get("DRY_RUN", "0") in ("1", "true", "yes")
CHAT = os.environ.get("TELEGRAM_CHAT_ID", "-1001396622973")
SITE = "https://h79gold.com/"
VN = ZoneInfo("Asia/Ho_Chi_Minh")
ET = ZoneInfo("America/New_York")  # tự xử lý giờ mùa hè/đông (DST)
CAL_VI = SITE + "lich-kinh-te.html"
CAL_EN = SITE + "en/economic-calendar.html"


def parse(t):
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def post(url, payload, headers=None):
    req = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read()[:300]


def fmt_en(e):
    en = e.get("title") or ""
    bits = [f"Forecast {e['forecast']}" if e.get("forecast") else "", f"Previous {e['previous']}" if e.get("previous") else ""]
    bits = " · ".join(b for b in bits if b)
    return "📌 " + en + (f"  ({bits})" if bits else "")


def fmt_vi(e):
    en = e.get("title") or ""
    vi = e.get("title_vi") or en
    bits = [f"Dự báo {e['forecast']}" if e.get("forecast") else "", f"Kỳ trước {e['previous']}" if e.get("previous") else ""]
    bits = " · ".join(b for b in bits if b)
    return "📌 " + vi + (f"  ({bits})" if bits else "")


def et_str(dt):
    t = dt.astimezone(ET)
    return f"{t.hour % 12 or 12}:{t:%M} {'AM' if t.hour < 12 else 'PM'} ET"


def build_text(when, mins, evs):
    """English/ET block first, Vietnamese block below (single bilingual message)."""
    seen_en, lines_en = set(), []
    seen_vi, lines_vi = set(), []
    for e in evs:
        le, lv = fmt_en(e), fmt_vi(e)
        if le not in seen_en:
            seen_en.add(le); lines_en.append(le)
        if lv not in seen_vi:
            seen_vi.add(lv); lines_vi.append(lv)
    en_block = (
        "🚨 RED NEWS ALERT\n"
        f"⏰ {et_str(when)} (in ~{mins} min)\n"
        + "\n".join(lines_en) + "\n"
        "⚠️ Expect sharp two-way swings in gold. Trim size, wait for the dust to settle\n"
        f"👉 Calendar: {CAL_EN}"
    )
    vi_block = (
        "🚨 TIN ĐỎ MỸ SẮP RA\n"
        f"⏰ {when.astimezone(VN):%H:%M} VN (còn ~{mins} phút)\n"
        + "\n".join(lines_vi) + "\n"
        "⚠️ Vàng dễ giật mạnh 2 chiều, giảm khối lượng, chờ nến ổn định\n"
        f"👉 Lịch tin: {CAL_VI}"
    )
    return en_block + "\n\n" + vi_block + "\n— Ngọc Huy · HuymasterGold79"


def main():
    now = parse(os.environ["NOW_UTC"]) if os.environ.get("NOW_UTC") else datetime.now(timezone.utc)
    events = [e for e in json.load(open(CAL, encoding="utf-8")).get("events", []) if e.get("impact") == "High" and e.get("time_utc")]
    try:
        state = json.load(open(STATE, encoding="utf-8"))
    except Exception:
        state = {"sent": {}}
    sent = state.setdefault("sent", {})
    # dọn khóa cũ > 3 ngày
    for k in [k for k in sent if parse(k) < now - timedelta(days=3)]:
        del sent[k]
    groups = {}
    for e in events:
        mins = (parse(e["time_utc"]) - now).total_seconds() / 60
        if 0 < mins <= WINDOW and e["time_utc"] not in sent:
            groups.setdefault(e["time_utc"], []).append(e)
    print(f"now={now.isoformat()} high_events={len(events)} due_groups={len(groups)} dry_run={DRY}")
    tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    os_app, os_key = os.environ.get("ONESIGNAL_APP_ID", ""), os.environ.get("ONESIGNAL_REST_KEY", "")
    for t, evs in sorted(groups.items()):
        when = parse(t)
        mins = max(1, round((when - now).total_seconds() / 60))
        hhmm = when.astimezone(VN).strftime("%H:%M")
        text = build_text(when, mins, evs)
        print("---- message ----\n" + text + "\n-----------------")
        ok = False
        if DRY:
            print("[DRY_RUN] không gửi Telegram/OneSignal")
            continue
        if tg_token:
            try:
                st, _ = post(f"https://api.telegram.org/bot{tg_token}/sendMessage",
                             {"chat_id": CHAT, "text": text, "disable_web_page_preview": True})
                print("telegram:", st); ok = True
            except Exception as ex:
                print("telegram lỗi:", type(ex).__name__, getattr(ex, "code", ""))
        else:
            print("Thiếu TELEGRAM_BOT_TOKEN – bỏ qua Telegram")
        if os_app and os_key:
            try:
                names = ", ".join(dict.fromkeys(e.get("title_vi") or e["title"] for e in evs))
                names_en = ", ".join(dict.fromkeys(e["title"] for e in evs))
                st, _ = post("https://api.onesignal.com/notifications",
                             {"app_id": os_app, "included_segments": ["Total Subscriptions"],
                              "headings": {"en": f"⚠️ US high-impact data in {mins} min", "vi": f"⚠️ {mins} phút nữa ra tin đỏ Mỹ"},
                              "contents": {"en": f"{names_en} – avoid trading right before the release.",
                                           "vi": f"{hhmm} VN: {names} – tránh vào lệnh sát giờ tin."},
                              "url": SITE + "en/economic-calendar.html", "ttl": 1200},
                             {"Authorization": f"Key {os_key}"})
                print("onesignal:", st); ok = True
            except Exception as ex:
                print("onesignal lỗi:", type(ex).__name__, getattr(ex, "code", ""))
        else:
            print("Chưa cấu hình OneSignal – bỏ qua push")
        if ok:
            sent[t] = now.isoformat()
    if not DRY:
        json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())

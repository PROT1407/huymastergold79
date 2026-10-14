#!/usr/bin/env python3
"""Cảnh báo tin đỏ Mỹ (High impact) trước giờ ra tin: Telegram + (tùy chọn) OneSignal.

Chạy bởi .github/workflows/red-news-alert.yml mỗi 5 phút. Cửa sổ: 0 < phút tới tin <= WINDOW_MIN
(mặc định 20, chịu được cron GitHub trễ vài phút). Chống trùng: state file (ALERT_STATE,
mặc định data/alert-state.json) lưu khóa = time_utc đã gửi; workflow giữ file qua actions/cache.
Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ONESIGNAL_APP_ID, ONESIGNAL_REST_KEY, DRY_RUN=1, NOW_UTC (test).
"""
import json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone

CAL = os.environ.get("CALENDAR", "data/calendar-us.json")
STATE = os.environ.get("ALERT_STATE", "data/alert-state.json")
WINDOW = float(os.environ.get("WINDOW_MIN", "20"))
DRY = os.environ.get("DRY_RUN", "0") in ("1", "true", "yes")
CHAT = os.environ.get("TELEGRAM_CHAT_ID", "-1001396622973")
SITE = "https://prot1407.github.io/huymastergold79/"
VN = timezone(timedelta(hours=7))


def parse(t):
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def post(url, payload, headers=None):
    req = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read()[:300]


def fmt(e):
    s = e.get("title_vi") or e.get("title")
    for suf, vi in ((" m/m", " (so tháng trước)"), (" y/y", " (so cùng kỳ năm)"), (" q/q", " (so quý trước)")):
        if (e.get("title") or "").endswith(suf) and e.get("title_vi"):
            s += vi
    bits = [f"dự báo {e['forecast']}" if e.get("forecast") else "", f"kỳ trước {e['previous']}" if e.get("previous") else ""]
    bits = ", ".join(b for b in bits if b)
    return s + (f" – {bits}" if bits else "")


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
        seen, lines = set(), []
        for e in evs:
            line = fmt(e)
            if line not in seen:
                seen.add(line); lines.append(line)
        hhmm = when.astimezone(VN).strftime("%H:%M")
        body = "; ".join(lines) if len(lines) == 1 else "\n" + "\n".join("• " + l for l in lines)
        text = (f"⚠️ {mins} phút nữa ({hhmm} VN) ra tin đỏ Mỹ: {body}\n"
                f"Tránh vào lệnh sát giờ tin, spread giãn.\n👉 Lịch kinh tế: {SITE}lich-kinh-te.html")
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
                              "url": SITE + "lich-kinh-te.html", "ttl": 1200},
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

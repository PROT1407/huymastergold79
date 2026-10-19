#!/usr/bin/env python3
"""Cảnh báo tin đỏ Mỹ (High impact) trước giờ ra tin: Telegram + (tùy chọn) OneSignal.

Chạy bởi .github/workflows/red-news-alert.yml mỗi 5 phút. Cửa sổ: 0 < phút tới tin <= WINDOW_MIN
(mặc định 20, chịu được cron GitHub trễ vài phút). Chống trùng: state file (ALERT_STATE,
mặc định data/alert-state.json) lưu khóa = time_utc đã gửi; workflow giữ file qua actions/cache.
Tin Telegram: khối English/ET trước, khối tiếng Việt sau (một tin song ngữ).
HẬU TIN (post-release): với mỗi tin USD High có số liệu, từ T+1 đến T+30 phút script đọc trang
ForexFactory theo ngày (JSON nhúng: actual/forecast/previous/actualBetterWorse), có 'actual' là gửi
MỘT tin/sự kiện (EN trước, VN sau), ghi actual vào data/calendar-us.json (workflow commit). Quá
T+30 chưa có số → bỏ qua + log, KHÔNG bịa số. Khi có tin trong cửa sổ [T-POLL_LEAD, T+30] script tự
lặp mỗi POLL_SEC giây (không phụ thuộc cron GitHub chạy đúng giờ). State: sent (trước tin), post (sau tin).
Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ONESIGNAL_APP_ID, ONESIGNAL_REST_KEY, DRY_RUN=1, NOW_UTC (test).
"""
import json, os, re, sys, time, urllib.request
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
POST_MAX = float(os.environ.get("POST_MAX_MIN", "30"))   # bỏ qua nếu T+30 chưa có actual
POLL_LEAD = float(os.environ.get("POLL_LEAD_MIN", "12"))  # bắt đầu giữ job chạy từ T-12
POLL_SEC = int(os.environ.get("POLL_SEC", "60"))
POLL = os.environ.get("POLL", "1") in ("1", "true", "yes")
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
    bits = [f"Dự báo {vn_num(e['forecast'])}" if e.get("forecast") else "", f"Kỳ trước {vn_num(e['previous'])}" if e.get("previous") else ""]
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


def vn_num(v):
    """US '1,234.5%' → VN '1.234,5%'."""
    return (v or "").replace(",", "\0").replace(".", ",").replace("\0", ".")


def tg_send(text):
    tok = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not tok:
        print("Thiếu TELEGRAM_BOT_TOKEN – bỏ qua Telegram"); return False
    try:
        st, _ = post(f"https://api.telegram.org/bot{tok}/sendMessage",
                     {"chat_id": CHAT, "text": text, "disable_web_page_preview": True})
        print("telegram:", st); return True
    except Exception as ex:
        print("telegram lỗi:", type(ex).__name__, getattr(ex, "code", ""))
        return False


# ---------- HẬU TIN ----------
INVERSE = ("unemployment", "jobless", "claims")  # cao hơn = xấu cho USD


def num(v):
    m = re.search(r"-?\d+(?:\.\d+)?", (v or "").replace(",", ""))
    if not m:
        return None
    x = float(m.group()); u = (v or "").strip()[-1:].upper()
    return x * {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}.get(u, 1)


def verdict(e):
    """+1 USD tốt (vàng giảm), -1 USD xấu (vàng tăng), 0 trung tính."""
    a, f = num(e.get("actual")), num(e.get("forecast") or e.get("previous"))
    if a is None or f is None:
        bw = e.get("_bw")  # fallback: ForexFactory actualBetterWorse (1 better, 2 worse)
        return {1: 1, 2: -1}.get(bw, 0)
    d = (a > f) - (a < f)
    return -d if any(k in e["title"].lower() for k in INVERSE) else d


def ff_day(day_et):
    """Đọc trang ForexFactory theo ngày (giờ ET) → {(title, epoch): {...}} cho USD."""
    if os.environ.get("FF_HTML"):
        html = open(os.environ["FF_HTML"], encoding="utf-8").read()
    else:
        url = f"https://www.forexfactory.com/calendar?day={day_et:%b}{day_et.day}.{day_et.year}".lower()
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"})
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
    out = {}
    for ch in html.split('{"id":')[1:]:
        g = lambda k: (re.search(r'"%s":"((?:[^"\\]|\\.)*)"' % k, ch) or [None, ""])[1].replace("\\/", "/")
        if g("currency") != "USD":
            continue
        dl = re.search(r'"dateline":(\d+)', ch); bw = re.search(r'"actualBetterWorse":(\d+)', ch)
        if dl:
            out[(g("name"), int(dl.group(1)))] = {"actual": g("actual"), "forecast": g("forecast"), "previous": g("previous"),
                                                 "revision": g("revision"), "bw": int(bw.group(1)) if bw else 0}
    return out


def build_post(e):
    when = parse(e["time_utc"]); v = verdict(e)
    t = when.astimezone(ET)
    prev = e.get("previous") or ""
    rev = e.get("_rev")
    ico = {1: "🟢", -1: "🔴", 0: "⚪"}[v]
    en_v = {1: "USD-POSITIVE → bearish for gold", -1: "USD-NEGATIVE → supportive for gold", 0: "IN LINE → limited directional impact"}[v]
    vi_v = {1: "TỐT CHO USD → bất lợi cho vàng", -1: "XẤU CHO USD → hỗ trợ vàng tăng", 0: "ĐÚNG DỰ BÁO → tác động hạn chế"}[v]
    en_g = {1: "Gold may dip as yields/USD rise – wait for the first candles to close, don't chase", -1: "Gold may bounce as USD softens – wait for confirmation, don't chase the spike", 0: "Gold likely stays in range – watch the next data/Fed headlines"}[v]
    vi_g = {1: "Vàng dễ bị ép giảm khi USD/lợi suất tăng – chờ nến đóng, không đuổi lệnh", -1: "Vàng dễ bật lên khi USD yếu – chờ xác nhận, không đuổi giá", 0: "Vàng dễ đi ngang – theo dõi tin/Fed tiếp theo"}[v]
    nums_en = f"Actual {e['actual']} vs Forecast {e.get('forecast') or 'n/a'} · Previous {prev or 'n/a'}" + (f" (rev. {rev})" if rev else "")
    nums_vi = f"Thực tế {vn_num(e['actual'])} vs Dự báo {vn_num(e.get('forecast')) or 'n/a'} · Kỳ trước {vn_num(prev) or 'n/a'}" + (f" (điều chỉnh {vn_num(rev)})" if rev else "")
    en_block = (f"{ico} RED NEWS RESULT\n"
                f"⏰ {t:%b} {t.day}, {t.year} · {et_str(when)}\n"
                f"📌 {e['title']}\n📊 {nums_en}\n"
                f"{ico} {en_v}\n💡 {en_g}\n👉 Calendar: {CAL_EN}")
    vi_block = (f"{ico} KẾT QUẢ TIN ĐỎ MỸ\n"
                f"⏰ {when.astimezone(VN):%H:%M %d/%m/%Y} VN\n"
                f"📌 {e.get('title_vi') or e['title']} ({e['title']})\n📊 {nums_vi}\n"
                f"{ico} {vi_v}\n💡 {vi_g}\n👉 Lịch tin: {CAL_VI}")
    return en_block + "\n\n" + vi_block + "\n— Ngọc Huy · HuymasterGold79"


def post_phase(now, data, state):
    """Trả về (số tin còn chờ actual, có sửa calendar không)."""
    done = state.setdefault("post", {})
    for k in [k for k in done if parse(k.split("|")[0]) < now - timedelta(days=3)]:
        del done[k]
    pend = []
    for e in data.get("events", []):
        if e.get("impact") != "High" or not e.get("time_utc"):
            continue
        key = e["time_utc"] + "|" + e["title"]
        if key in done:
            continue
        if not (e.get("forecast") or e.get("previous") or e.get("actual")):
            continue  # phát biểu/họp báo: không có số
        mins = (now - parse(e["time_utc"])).total_seconds() / 60
        if mins > POST_MAX:
            if mins <= POST_MAX + 60 * 24:
                print(f"[post] BỎ QUA {key}: quá T+{POST_MAX:.0f}′ chưa gửi được (actual={e.get('actual') or 'không có'})"); done[key] = "skipped:" + now.isoformat()
            continue
        if mins >= -POLL_LEAD:
            pend.append((mins, key, e))
    changed, waiting = False, 0
    days = {}
    for mins, key, e in pend:
        ff = None
        if mins < 1 and not e.get("actual"):
            waiting += 1; continue
        if not e.get("actual"):
            d = parse(e["time_utc"]).astimezone(ET).date()
            try:
                if d not in days:
                    days[d] = ff_day(d)
                ff = days[d].get((e["title"], int(parse(e["time_utc"]).timestamp())))
            except Exception as ex:
                print("[post] lỗi đọc ForexFactory:", type(ex).__name__, getattr(ex, "code", "")); ff = None
            if not ff or not ff["actual"]:
                print(f"[post] {key}: chưa có actual (T{mins:+.0f}′)"); waiting += 1; continue
            e["actual"] = ff["actual"]; e["actual_src"] = "ForexFactory"
            for k in ("forecast", "previous"):
                if ff[k] and not e.get(k):
                    e[k] = ff[k]
            if ff["revision"]:
                e["actual_prev_rev"] = ff["revision"]
            changed = True
        tmp = dict(e, _bw=(ff or {}).get("bw", 0), _rev=e.get("actual_prev_rev"))
        text = build_post(tmp)
        print("---- post message ----\n" + text + "\n----------------------")
        if DRY:
            print("[DRY_RUN] không gửi"); continue
        if tg_send(text):
            done[key] = now.isoformat()
    if changed and not DRY:
        data["has_actual"] = True
        json.dump(data, open(CAL, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("[post] đã ghi actual vào", CAL)
    return waiting, changed


def main():
    if os.environ.get("NOW_UTC") or not POLL:
        return run_once()
    t0 = time.time()
    while True:
        waiting = run_once()
        if not waiting or time.time() - t0 > (POST_MAX + POLL_LEAD + 5) * 60:
            return 0
        print(f"... còn {waiting} tin chờ actual, ngủ {POLL_SEC}s"); sys.stdout.flush()
        time.sleep(POLL_SEC)


def run_once():
    now = parse(os.environ["NOW_UTC"]) if os.environ.get("NOW_UTC") else datetime.now(timezone.utc)
    data = json.load(open(CAL, encoding="utf-8"))
    events = [e for e in data.get("events", []) if e.get("impact") == "High" and e.get("time_utc")]
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
    waiting, _ = post_phase(now, data, state)
    if not DRY:
        json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return waiting


if __name__ == "__main__":
    sys.exit(main())

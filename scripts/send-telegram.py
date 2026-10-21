#!/usr/bin/env python3
"""Gửi bài lên Telegram @HTFXGROUP khi chủ site tick “📲 Gửi Telegram khi đăng” ở /admin/.

Chạy trong GitHub Action (build-seo.yml, job telegram) SAU khi build-seo đã sinh và push trang.
- Chỉ xử lý bài có "telegram_send": true và CHƯA có "telegram_sent" (bài cũ không bao giờ gửi lại).
- Chờ trang bài trên https://h79gold.com trả 200 (tối đa ~5 phút) rồi mới gửi.
- Gửi bản EN trước, VN sau. Bài vi_only / không có tiêu đề EN / không sinh trang EN → chỉ gửi VN.
  Bản EN chỉ dùng các trường *_en (không nhắc vàng trong nước).
- Gửi xong: xoá "telegram_send", ghi "telegram_sent": {"at", "msgs"} rồi commit (GITHUB_TOKEN, [skip ci]) → không gửi lặp.
- Bài quá cũ (> TG_MAX_AGE_H giờ, mặc định 36) bị bỏ qua: xoá cờ, ghi "telegram_skipped".

Env: TELEGRAM_BOT_TOKEN (secret, không bao giờ in ra), TELEGRAM_CHAT_ID (mặc định -1001396622973),
     DRY_RUN=1 (chỉ in tin, không gửi, không ghi file), TG_WAIT_S (mặc định 300), TG_NO_WAIT=1 (bỏ chờ trang),
     TG_DATA (đường dẫn strategies.json, để test), TG_NO_COMMIT=1 (không git commit/push).
"""
import datetime as dt, importlib.util, json, mimetypes, os, re, subprocess, sys, time, urllib.error, urllib.request, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("TG_DATA") or ROOT / "data" / "strategies.json")
CHAT = os.environ.get("TELEGRAM_CHAT_ID") or "-1001396622973"
DRY = os.environ.get("DRY_RUN", "0") == "1"
WAIT_S = int(os.environ.get("TG_WAIT_S", "300"))
MAX_AGE_H = float(os.environ.get("TG_MAX_AGE_H", "36"))
VN_TZ = dt.timezone(dt.timedelta(hours=7))
SLOGAN_VI = "💡 Làm theo kế hoạch, đừng chạy theo nến tin."
SLOGAN_EN = "💡 Trade the plan, not the noise."
CAP_MAX = 1024  # giới hạn caption ảnh Telegram
# EN không bao giờ nhắc vàng trong nước Việt Nam
VN_DOMESTIC = re.compile(r"SJC|PNJ|DOJI|B[aả]o T[ií]n|VND|\bdomestic\b|Vietnam(ese)? gold|v[aà]ng (trong n[uư][oớ]c|mi[eế]ng|nh[aẫ]n)|tri[eệ]u", re.I)

spec = importlib.util.spec_from_file_location("buildseo", ROOT / "scripts" / "build-seo.py")
B = importlib.util.module_from_spec(spec); spec.loader.exec_module(B)
BASE = B.BASE_URL  # https://h79gold.com/


def u16len(s): return len(s.encode("utf-16-le")) // 2


def pages(s):
    """(vn_rel, en_rel|None) – cùng công thức với scripts/build-seo.py; EN chỉ khi trang EN thật sự được sinh."""
    t = s.get("time")
    f = f"{s['date']}-nhan-dinh-vang-{B.slug(s.get('session', '')) or 'phien'}{'-' + t.replace(':', '') if t else ''}.html"
    vn = "bai/" + f
    en = None
    if not s.get("vi_only") and (s.get("title_en") or s.get("headline_en")):
        en = s["url_en"] if str(s.get("url_en", "")).startswith("en/posts/") else B.en_post_file(f)
        if en and not (ROOT / en).exists() and os.environ.get("TG_ASSUME_EN") != "1": en = None
    has_en_body = bool((s.get("article_en") or {}).get("sections") or s.get("trend_en") or (s.get("summary") or {}).get("trendText_en")
                       or (s.get("summary") or {}).get("sell") or (s.get("summary") or {}).get("buy"))
    return vn, (en if has_en_body else None)


def tp_fmt(tp):
    tp = re.sub(r"\bTP\s*\d?\s*", "", str(tp or "")).strip()
    parts = [p.strip() for p in re.split(r"\s*(?:→|->|·|/)\s*", tp) if p.strip()]
    if len(parts) >= 2: return " · ".join(f"TP{i + 1} {p}" for i, p in enumerate(parts))
    return f"TP {parts[0]}" if parts else ""


def plan_line(o, en):
    if not o or not o.get("zone"): return None
    zone = o.get("zone_en") or B.en_num(re.sub(r"\s*\(.*?\)\s*", " ", o["zone"]).strip()) if en else o["zone"]
    sl = (o.get("sl_en") or B.en_num(o["sl"])) if en and o.get("sl") else o.get("sl")
    tp = (o.get("tp_en") or B.en_num(o["tp"])) if en and o.get("tp") else o.get("tp")
    return " | ".join(x for x in [re.sub(r"\s*[–-]\s*", "–", zone.strip()), sl and f"SL {sl}", tp and tp_fmt(tp)] if x)


def first_para(a, n=260):
    for x in (a or {}).get("sections", []):
        p = re.sub(r"\*\*(.+?)\*\*", r"\1", (x.get("p") or "")).strip()
        if p and not re.search(r"🔴|🟢", p):
            p = re.sub(r"\s+", " ", p)
            return p if len(p) <= n else p[:n - 1].rsplit(" ", 1)[0] + "…"
    return ""


def message(s, en, url):
    m = s.get("summary") or {}
    if en:
        title = (s.get("headline_en") or s.get("title_en") or "").strip()
        title = re.sub(r"(?i)^h79 gold plan\s*[–-]\s*", "", title)
        head = f"🎯 H79 GOLD PLAN – {title}"
        lead = m.get("trendText_en") or s.get("trend_en") or first_para(s.get("article_en"))
        sell, buy = plan_line(m.get("sell"), True), plan_line(m.get("buy"), True)
        lines = [f"🔴 SELL {sell}" if sell else None, f"🟢 BUY {buy}" if buy else None]
        note = re.sub(r"(?i)^key risk:\s*", "", m.get("note_en") or "")
        tail = "Not investment advice."
        slogan = SLOGAN_EN
        if lead and VN_DOMESTIC.search(lead): lead = ""
        if note and VN_DOMESTIC.search(note): note = ""
    else:
        title = (s.get("headline") or s.get("title") or "").strip()
        head = f"🎯 H79 NHẬN ĐỊNH – {title}"
        lead = m.get("trendText") or first_para(s.get("article")) or s.get("trend") or ""
        sell, buy = plan_line(m.get("sell"), False), plan_line(m.get("buy"), False)
        lines = [f"🔴 BÁN {sell}" if sell else None, f"🟢 MUA {buy}" if buy else None]
        note = m.get("note") or ""
        tail = "Không phải lời khuyên đầu tư."
        slogan = SLOGAN_VI
    lines = [x for x in lines if x]

    def build(lead, note):
        warn = f"⚠️ {note.rstrip('. ')}. {tail}" if note else f"⚠️ {tail}"
        return "\n".join(x for x in [head, lead, *lines, warn, url, slogan] if x)
    txt = build(lead, note)
    for _ in range(40):  # vừa caption 1024 ký tự: cắt dần phần mở đầu rồi lưu ý
        if u16len(txt) <= CAP_MAX: break
        if lead: lead = lead[:max(0, len(lead) - 60)].rsplit(" ", 1)[0] + "…" if len(lead) > 80 else ""
        elif note: note = note[:max(0, len(note) - 60)].rsplit(" ", 1)[0] + "…" if len(note) > 80 else ""
        else: break
        txt = build(lead, note)
    return txt


def tg(method, fields, photo=None):
    tok = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not tok: raise RuntimeError("Thiếu TELEGRAM_BOT_TOKEN (repo secret)")
    if photo:
        b = uuid.uuid4().hex; body = b""
        for k, v in fields.items(): body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        ct = mimetypes.guess_type(photo.name)[0] or "image/jpeg"
        body += f'--{b}\r\nContent-Disposition: form-data; name="photo"; filename="{photo.name}"\r\nContent-Type: {ct}\r\n\r\n'.encode() + photo.read_bytes() + f"\r\n--{b}--\r\n".encode()
        hdr = {"Content-Type": f"multipart/form-data; boundary={b}"}
    else:
        body = json.dumps(fields).encode(); hdr = {"Content-Type": "application/json"}
    rq = urllib.request.Request(f"https://api.telegram.org/bot{tok}/{method}", data=body, headers=hdr)
    try:
        r = json.load(urllib.request.urlopen(rq, timeout=60))
    except urllib.error.HTTPError as e:  # không in URL (có token)
        raise RuntimeError(f"Telegram {method} HTTP {e.code}: {e.read()[:300].decode('utf-8', 'ignore')}") from None
    except Exception as e:
        raise RuntimeError(f"Telegram {method} lỗi {type(e).__name__}") from None
    if not r.get("ok"): raise RuntimeError(f"Telegram {method}: {str(r)[:300]}")
    return r["result"]["message_id"]


def send(text, img):
    if DRY: print(f"[DRY_RUN] {'sendPhoto ' + str(img.relative_to(ROOT)) if img else 'sendMessage'} ({u16len(text)} ký tự):\n{text}\n"); return 0
    if img: return tg("sendPhoto", {"chat_id": CHAT, "caption": text}, img)
    return tg("sendMessage", {"chat_id": CHAT, "text": text})


def live(url, wait):
    end = time.time() + wait
    while True:
        try:
            with urllib.request.urlopen(urllib.request.Request(url + "?tg=" + str(int(time.time())), headers={"Cache-Control": "no-cache", "User-Agent": "h79-telegram"}), timeout=20) as r:
                if r.status == 200: return True
        except Exception: pass
        if time.time() >= end: return False
        time.sleep(15)


def image(s, en):
    p = (s.get("image_en") or s.get("image")) if en else s.get("image")
    if not p or "://" in p: return None
    f = ROOT / p
    return f if f.is_file() and f.stat().st_size < 10_000_000 else None


def age_h(s):
    try:
        hh, mm = map(int, (s.get("time") or "00:00").split(":")); y, mo, d = map(int, s["date"].split("-"))
        return (dt.datetime.now(VN_TZ) - dt.datetime(y, mo, d, hh, mm, tzinfo=VN_TZ)).total_seconds() / 3600
    except Exception: return 0


def git(*a): return subprocess.run(["git", *a], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def record(updates):
    """Ghi kết quả vào strategies.json mới nhất trên main (tránh xung đột với lần sửa của chủ site) rồi push."""
    if DRY or not updates: return
    no_commit = os.environ.get("TG_NO_COMMIT") == "1"
    for attempt in range(5):
        if not no_commit:
            git("fetch", "-q", "origin", "main"); git("reset", "-q", "--hard", "origin/main")
        d = json.loads(DATA.read_text(encoding="utf-8"))
        for s in d.get("strategies", []):
            if s.get("id") in updates:
                s.pop("telegram_send", None); s.update(updates[s["id"]])
        DATA.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        if no_commit: return
        if not git("status", "--porcelain", "--", str(DATA.relative_to(ROOT))).strip(): return
        git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit", "-q", "-m", "Telegram: đánh dấu đã gửi " + ", ".join(updates) + " [skip ci]", "--", str(DATA.relative_to(ROOT)))
        try: git("push", "-q", "origin", "HEAD:main"); print("Đã ghi telegram_sent lên main"); return
        except subprocess.CalledProcessError: time.sleep(5 + attempt * 5)
    raise RuntimeError("Không push được telegram_sent – CẦN KIỂM TRA để tránh gửi lặp")


def main():
    d = json.loads(DATA.read_text(encoding="utf-8"))
    todo = [s for s in d.get("strategies", []) if s.get("telegram_send") is True and not s.get("telegram_sent") and not s.get("example")]
    print(f"Bài chờ gửi Telegram: {len(todo)}" + (" [DRY_RUN]" if DRY else ""))
    updates, failed = {}, 0
    now = dt.datetime.now(VN_TZ).isoformat(timespec="seconds")
    for s in todo:
        sid = s.get("id")
        if age_h(s) > MAX_AGE_H:
            print(f"{sid}: bài cũ hơn {MAX_AGE_H:.0f} giờ – không gửi, xoá cờ")
            updates[sid] = {"telegram_skipped": f"{now} bài quá cũ"}; continue
        vn, en = pages(s)
        targets = ([("en", BASE + en)] if en else []) + [("vi", BASE + vn)]
        if not DRY and os.environ.get("TG_NO_WAIT") != "1":
            bad = [u for _, u in targets if not live(u, WAIT_S)]
            if bad:
                print(f"{sid}: trang chưa lên sau {WAIT_S}s: {bad} – để lần chạy sau"); failed += 1; continue
        msgs = {}
        try:
            for lang, url in targets:
                msgs[lang] = send(message(s, lang == "en", url), image(s, lang == "en"))
                print(f"{sid}: đã gửi {lang.upper()} msg_id={msgs[lang]}")
        except Exception as ex:
            print(f"{sid}: LỖI gửi – {ex}"); failed += 1
            if not msgs: continue  # chưa gửi được gì → giữ cờ để thử lại
        updates[sid] = {"telegram_sent": {"at": now, "chat": CHAT, "msgs": msgs}}
    record(updates)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

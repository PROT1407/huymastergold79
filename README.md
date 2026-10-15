# HuymasterGold79 – Phiên bản 2 (nhiều trang)

Website tĩnh, không cần build. Kéo thả cả thư mục (hoặc file zip) lên Netlify Drop / Vercel / GitHub Pages.

## Trang
| File | Nội dung |
|---|---|
| index.html | Trang chủ: nhận định nhanh, quy đổi mini, vàng/bạc/Bitcoin, bảng giá, biểu đồ, tin tức, lịch kinh tế, đăng ký |
| gia-vang.html | Bảng giá vàng miếng & nhẫn (đổi chỉ/lượng), quy đổi, máy tính vàng, biểu đồ chênh lệch SJC, sổ tích lũy, bạc & Bitcoin |
| bieu-do.html | Biểu đồ TradingView toàn trang, 7 nút chính + 139 mã |
| chien-luoc.html | Chiến lược hôm nay + lưu trữ (`?ngay=2026-10-12` để mở 1 ngày) |
| tin-tuc.html / lich-kinh-te.html | Widget tin tức & lịch kinh tế TradingView |
| kien-thuc.html | Bài hướng dẫn cho người mới |
| live.html | Phòng Live (YouTube TRADING LIVE XAUUSD), lịch `data/live-schedule.json`, đếm ngược, Google Calendar |
| quy-forex.html | Xây dựng quỹ Forex – dữ liệu `data/fund.json` (SỐ LIỆU MẪU) |
| tai-khoan-follow.html | Tài khoản Follow – dữ liệu `data/follow-accounts.json` (SỐ LIỆU MẪU) |
| lien-he.html | Về tôi, QR Zalo, YouTube, email |

Header, menu, thanh giá vàng chạy chữ, footer, nút Zalo nổi được tạo bởi `js/common.js` (sửa menu ở mảng `M`). Các chức năng nằm trong `js/app.js`. Giao diện sáng/tối: nút 🌓.

## Cập nhật hằng ngày
- **Kết quả kế hoạch H79:** `data/h79-results.json` – mỗi lần cập nhật nhận định, đánh dấu kế hoạch mở trước (win nếu TP1 trước SL, loss nếu SL trước, hết phiên kèm P/L; ghi zone_filled và MFE).
- **Chiến lược:** thêm mục mới vào `data/strategies.json` (cấu trúc giống v1). Xoá các mục `"example": true`.
- **Giá trong nước:** tự lấy từ vang.today; dự phòng `data/vn-prices.json`.
- **Lịch sử chênh lệch:** `data/gap-history.json` hiện là DỮ LIỆU VÍ DỤ – thay bằng số liệu thật `{ "date", "world", "sjc" }` (VND/lượng) và đặt `"example": false`. Trình duyệt người xem cũng tự ghi lại 1 điểm/ngày.
- **Danh sách mã biểu đồ:** `data/symbols.json`.

## Triển khai & tên miền
Giống v1: Netlify (kéo thả), Vercel, GitHub Pages; trỏ DNS tên miền .com.vn (A/CNAME) theo hướng dẫn của nhà cung cấp hosting.

Nội dung chỉ mang tính tham khảo, không phải lời khuyên đầu tư.
- **Forex:** sửa `data/fund.json` và `data/follow-accounts.json` bằng số liệu thật, thêm `verify_url` (Myfxbook/FXBlue…) và đặt `"example": false` để ẩn nhãn "SỐ LIỆU VÍ DỤ MẪU".
- **Lịch live:** sửa `data/live-schedule.json` (day 0=CN…6=T7, giờ VN). Khi đang live có thể điền `liveVideoId` để hiện khung chat.
- **Tin vĩ mô:** thêm tin vào đầu mảng `items` trong `data/macro-news.json` (category: Lợi suất/Trái phiếu/Tương quan/Fed/FOMC/Chiến tranh – cập nhật hằng ngày gồm cả tin chiến tranh & địa chính trị ảnh hưởng vàng; impact: tăng/giảm/trung lập; luôn ghi nguồn uy tín có link – không đăng tin từ tài liệu nội bộ/cá nhân). Lịch FOMC ở `fomc.meetings`.

## SEO – trang tĩnh cho Google (bắt buộc trước khi push)
Nội dung chiến lược/tin vĩ mô/giá vàng được JS vẽ từ JSON nên Google đọc được rất ít. Script `scripts/build-seo.py` sinh trang HTML tĩnh:
`bai/*.html` (nhận định H79 theo phiên, bản tin vĩ mô theo ngày, giá vàng trong nước theo ngày), `bai/index.html` (Kho bài viết), `sitemap.xml`, `robots.txt`, đồng bộ canonical/OG trang chính và khối "Bài viết mới" trên trang chủ.

**Mọi routine cập nhật dữ liệu phải chạy lệnh sau ngay trước khi commit/push:**
```
python3 scripts/build-seo.py
```
Script idempotent (chạy lại không đổi gì nếu JSON không đổi), chỉ hiển thị nội dung có trong JSON, không dùng thư viện ngoài. Đổi tên miền: sửa `BASE_URL` ở đầu script rồi chạy lại.

Tự động: workflow `.github/workflows/build-seo.yml` chạy script này khi push thay đổi `data/**` lên main và mỗi ngày 00:05 UTC, tự commit (github-actions[bot]) nếu có thay đổi. Chạy tay trước khi push vẫn nên làm để trang lên ngay.

## English version (`en/`) – trường `_en` trong `data/strategies.json`
Trang tiếng Anh (cặp VI ↔ EN): `index` ↔ `en/index.html`, `nhan-dinh-h79` ↔ `en/h79-analysis.html` (render bởi `js/en-h79.js`), `tin-tuc` ↔ `en/news.html`, `lich-kinh-te` ↔ `en/economic-calendar.html`, `gia-vang` ↔ `en/vietnam-gold-market.html`, `bieu-do` ↔ `en/charts.html`, `live` ↔ `en/live.html`, `kien-thuc` ↔ `en/learn.html`, `quy-forex` ↔ `en/trading-fund.html`, `tai-khoan-follow` ↔ `en/copy-trading.html`, `gioi-thieu` ↔ `en/about.html`, `lien-he` ↔ `en/contact.html`, `bai/index.html` ↔ `en/posts/index.html`. Trang dữ liệu EN render bởi `js/en-pages.js`; bài tĩnh `en/posts/*.html` (nhận định H79 + bản tin vĩ mô có `title_en`) do `scripts/build-seo.py` sinh. Nút VI | EN và cặp trang ở `js/common.js` (`LANG_PAIRS`); hreflang + sitemap do `scripts/build-seo.py` sinh (`LANG_PAIRS`, `EN_PAGES`).

**Routine H79 nên điền thêm các trường tiếng Anh (tùy chọn – thiếu thì trang EN tự fallback):**

| Trường | Ý nghĩa | Fallback khi thiếu |
|---|---|---|
| `title_en` | Tiêu đề kiểu trader Mỹ, ví dụ "H79 Gold Plan – Asian session, Oct 14: …" | "H79 Gold Plan – <session>, <Oct 14, 2026>" |
| `session_en` | "Asian session (Tokyo)" / "London session" / "New York session" / "London/NY overlap" | map từ `session` (giá trị cũ cũng tự đổi) |
| `summary.trendText_en` | "Bearish" / "Bullish" / "Sideways" | dịch từ enum `summary.trend` |
| `summary.sell.zone_en`, `summary.buy.zone_en` | chỉ cần khi `zone` có chữ tiếng Việt, ví dụ "(chỉ khi chuyển kênh tăng)" | số trong `zone` (bỏ phần chữ trong ngoặc) |
| `summary.sell.sl_en` / `tp_en`, `summary.buy.sl_en` / `tp_en` | chỉ khi SL/TP có chữ | số của `sl` / `tp` |
| `summary.note_en` | rủi ro chính 1 dòng, giờ ET, ví dụ "US CPI 8:30 AM ET (est. 3.6% y/y) – stops to breakeven before the print" (trang tự thêm "Key risk:") | ẩn |
| `summary.priceNote_en` | "Spot XAU/USD price (converted)" hoặc "COMEX gold futures price (GC=F), not spot – spot XAU/USD is about N USD lower" | câu chung theo `summary.price` |
| `trend_en`, `entryZones_en[]`, `sellZones_en[]`, `scenarios_en[]`, `macro_en[]`, `physicalAdvice_en`, `notes_en`, `dataTime_en`, `disclaimer_en` | phần "See more" | ẩn + link bản tiếng Việt |

Quy ước tiếng Anh (bắt buộc cho mọi trường `_en`): viết như trader Mỹ viết, không dịch từng chữ.
- **Giờ: luôn là US Eastern (ET)**, tự tính DST (EDT = giờ VN − 11h, EST từ CN đầu tháng 11 = giờ VN − 12h), dạng "8:30 AM ET", "Oct 13, 9:30 PM ET" – **không** ghi "Vietnam time"/"GMT+7"/"19:30". Trường `date`/`time` gốc vẫn là giờ VN; trang EN tự đổi sang ET (hover hiện giờ địa phương của người đọc).
- Ngày "Oct 14" / "Oct 14, 2026"; số kiểu Mỹ 4,211.50; khoảng giá "4,211–4,221"; tiền "$21".
- Thuật ngữ: Bias, Sell zone / Buy zone, Long / Short, Stop, Targets, "stops to breakeven", "be flat before the print", "buy dips", "sell rallies", "daily is bearish". Không dùng "SL/TP", "giá giao ngay quy đổi", đơn vị VND/lượng.
- Phiên: Asian session (Tokyo), London session, New York session, London/NY overlap.
Không hứa lợi nhuận; số liệu quỹ/follow mẫu phải ghi rõ là mẫu. Ticker trang EN chỉ hiện XAU/USD, Silver, DXY (ước tính), EUR/USD, USD/JPY, BTC – không có giá vàng trong nước.

### Trường `_en` ở các file dữ liệu khác (routine nên điền khi thêm/sửa mục)
Trang EN **ẩn** mục chưa có bản tiếng Anh (không hiện tiếng Việt), nên routine phải điền `_en` cho mục mới. Quy ước tiếng Anh như trên (giờ ET, số kiểu Mỹ, không VND/lượng ngoài trang giá vàng VN).

| File | Trường `_en` | Ghi chú |
|---|---|---|
| `data/macro-news.json` | `items[].title_en` (bắt buộc để hiện trên EN), `summary_en`, `reason_en`, `time_en`, `check_en` (tùy chọn); `items[].source.name_en`, `source2.name_en` (khi tên nguồn có chữ Việt); `fomc.note_en`, `fomc.meetings[].result_en`, `us_schedule[].event_en` | `time_en` ghi giờ ET, ví dụ "Oct 13, 8:30 AM ET" |
| `data/strategies.json` | xem bảng ở trên | |
| `data/calendar-us.json` | `events[].explain_en` | `scripts/update-calendar.py` tự điền theo từ điển `EN` |
| `data/fedwatch.json` | `label_en` (tùy chọn), `source.name_en` | nhãn tự suy từ `decision` |
| `data/symbols.json` | `categories[].name_en`, `symbols[].n_en`, `external[].n_en`, `external[].cat_en` | |
| `data/fund.json` | `title_en`, `intro_en`, `summary[].label_en` / `value_en`, `roadmap[].phase_en` / `time_en` / `desc_en`, `risk_rules_en[]`, `performance[].note_en` | trang EN gắn nhãn SAMPLE |
| `data/follow-accounts.json` | `steps[].title_en` / `desc_en`, `accounts[].name_en` / `platform_en` / `style_en` / `min_deposit_en` / `status_en`, `faq[].q_en` / `a_en` | trang EN gắn nhãn SAMPLE |
| `data/live-schedule.json` | `sessions[].title_en` / `desc_en`, `topics_en[]` | giờ live tự đổi sang ET |
| `data/vn-gold-daily.json` | `analysis_en[]`, `advice_en`, `peak.label_en` / `note_en`, `refs[].name_en` / `facts_en`, `world.note_en`, `*.source.name_en` | chỉ dùng ở `en/vietnam-gold-market.html` |

Cache-busting: đổi `?v=` trên mọi trang (kể cả `en/`, `en/posts/`, `bai/`) và `ASSET_V` trong `scripts/build-seo.py` cùng lúc.

## Cảnh báo tin đỏ Mỹ (tự động)
- `.github/workflows/red-news-alert.yml` chạy mỗi 5 phút → `scripts/red-news-alert.py` đọc `data/calendar-us.json`, gửi 1 tin Telegram (chat -1001396622973) cho mỗi mốc giờ có tin High trong 0–20 phút tới. Chống trùng bằng `.alert-state.json` giữ qua `actions/cache`. Chạy tay: Actions → red-news-alert → Run workflow (mặc định dry_run=1, chỉ log; `now_utc` để giả lập).
- Banner web: `js/news-alert.js` (tự tải từ `js/common.js`), hiện 15' trước → 5' sau tin.
- OneSignal (đang TẮT): điền `ONESIGNAL_APP_ID` trong `js/push-config.js` để bật web push; thêm repo variable/secret `ONESIGNAL_APP_ID` + secret `ONESIGNAL_REST_KEY` để workflow gửi push. Worker: `/huymastergold79/OneSignalSDKWorker.js`, scope `/huymastergold79/` (GitHub Pages project site không phục vụ được file ở gốc domain `prot1407.github.io/`, nên OneSignal phải cấu hình đúng path/scope này; trong OneSignal Dashboard chọn "Custom Code", Site URL `https://prot1407.github.io`, và nếu dùng chung domain với project khác thì scope phải tách riêng).

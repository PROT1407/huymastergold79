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
Trang tiếng Anh: `en/index.html`, `en/h79-analysis.html` (render bởi `js/en-h79.js`), `en/about.html`. Nút VI | EN và cặp trang ở `js/common.js` (`LANG_PAIRS`); hreflang + sitemap do `scripts/build-seo.py` sinh (`LANG_PAIRS`, `EN_PAGES`).

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

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

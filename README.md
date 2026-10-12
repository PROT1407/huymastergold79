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

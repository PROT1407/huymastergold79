#!/usr/bin/env python3
"""Tạo (một lần) trang riêng cho mọi tin đang có trong data/macro-news.json: tin/ và en/stories/.

Chỉ chạy trên máy, không gọi Render/Gemini, không tốn hạn ngạch. Gán slug cho tin chưa có
(giữ nguyên slug đã có), sinh trang, cập nhật sitemap.xml. Idempotent; về sau build-seo.py
(chạy sau mỗi lượt đăng tin) tự tạo trang cho tin mới.
"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("build_seo", Path(__file__).with_name("build-seo.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

if __name__ == "__main__":
    mod.main()

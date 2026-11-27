import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('build_seo', SCRIPTS / 'build-seo.py')
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)


def article(**kw):
    a = dict(kind='nd', file='2026-11-24-nhan-dinh-vang-nhan-dinh-chung-1130.html',
             title='Vàng 24/11 nhận định chung: hai đỉnh dưới cản', desc='Hướng giảm, bán hồi.',
             pub='2026-11-24T11:30:00+07:00', when='24/11/2026')
    a.update(kw)
    return a


class OgShare(unittest.TestCase):
    def test_generated_page_without_chart_has_no_og_image(self):
        html = bs.page(article(), '<p>body</p>')
        self.assertNotIn('og:image', html)
        self.assertNotIn('twitter:image', html)
        self.assertNotIn('og-h79-v3', html)
        self.assertIn('twitter:card" content="summary"', html)
        self.assertIn('og:title" content="Vàng 24/11 nhận định chung: hai đỉnh dưới cản"', html)
        self.assertNotIn('"image":', html)

    def test_generated_page_keeps_own_chart(self):
        html = bs.page(article(img='img/charts/gold-2026-11-24-nhan-dinh-chung.jpg'), '<p>body</p>')
        self.assertIn('og:image" content="https://h79gold.com/img/charts/gold-2026-11-24-nhan-dinh-chung.jpg"', html)
        self.assertIn('twitter:image" content="https://h79gold.com/img/charts/gold-2026-11-24-nhan-dinh-chung.jpg"', html)
        self.assertIn('twitter:card" content="summary_large_image"', html)
        self.assertNotIn('og-h79-v3', html)
        self.assertIn('img/charts/gold-2026-11-24-nhan-dinh-chung.jpg', html)

    def test_og_img_ignores_default_and_style_fallback(self):
        self.assertIsNone(bs.og_img({}))
        self.assertIsNone(bs.og_img({'ogimg': 'img/og/style-a.png'}))
        self.assertIsNone(bs.og_img({'img': 'img/og-h79-v3.png'}))
        self.assertEqual(bs.og_img({'img': 'img/charts/x.jpg'}), 'img/charts/x.jpg')

    def test_drop_default_banner_keeps_portrait(self):
        banner = '<meta property="og:image" content="https://h79gold.com/img/og-h79-v3.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://h79gold.com/img/og-h79-v3.png">'
        out = bs.drop_default_share_image(banner)
        self.assertNotIn('og:image', out)
        self.assertNotIn('twitter:image', out)
        self.assertIn('twitter:card" content="summary"', out)
        portrait = '<meta property="og:image" content="https://h79gold.com/img/huy.jpg">'
        self.assertEqual(bs.drop_default_share_image(portrait), portrait)

    def test_gia_vang_share_uses_sjc_and_ring(self):
        title, desc = bs.gia_vang_share()
        self.assertIn('Giá vàng SJC hôm nay', title)
        self.assertIn('triệu', title)
        self.assertIn('Nhẫn SJC 9999', desc)
        self.assertIn('Nhẫn PNJ 24K', desc)
        self.assertNotIn('og-h79', title + desc)

    def test_latest_macro_share_is_top_story(self):
        title, desc = bs.latest_macro_share(False)
        self.assertTrue(title)
        self.assertTrue(desc)
        self.assertNotIn('Tin tức thị trường vàng mới nhất', title)
        en_title, en_desc = bs.latest_macro_share(True)
        self.assertTrue(en_title)
        self.assertNotEqual(en_title, title)


if __name__ == '__main__':
    unittest.main()

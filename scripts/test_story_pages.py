import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('build_seo', SCRIPTS / 'build-seo.py')
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

ITEM = {
    'date': '2026-11-26', 'category': 'Vàng', 'priority': 1, 'impact': 'tăng',
    'title': 'Vàng hồi phục nhờ lực mua bắt đáy', 'summary': 'Vàng giao ngay quanh 3.569,90 USD/oz. Fed giữ lãi suất.',
    'reason': 'Ngắn hạn: mua bắt đáy. Dài hạn: USD mạnh.', 'time_vn': 'Thứ Năm 26/11/2026 10:00 giờ VN',
    'source': {'name': 'Kitco', 'name_en': 'Kitco', 'url': 'https://www.kitco.com/news/x'},
    'title_en': 'Gold rebounds on bargain hunting', 'summary_en': 'Spot gold near $3,569.90. The Fed held.',
    'reason_en': 'Short-term: dip buying.', 'time_en': 'Nov 26, 10:00 EST', 'published_vn': '2026-11-26 10:00',
}


class StoryPages(unittest.TestCase):
    def test_slug_has_date_prefix_and_is_unique(self):
        taken = set()
        a = bs.story_slug('Giá vàng đảo chiều: Đô la tăng!', '2026-11-26', taken)
        b = bs.story_slug('Giá vàng đảo chiều: Đô la tăng!', '2026-11-26', taken)
        self.assertEqual(a, '2026-11-26-gia-vang-dao-chieu-do-la-tang')
        self.assertEqual(b, a + '-2')
        long = bs.story_slug('một ' * 60, '2026-11-26', set())
        self.assertLessEqual(len(long), 11 + 60)
        self.assertRegex(bs.story_slug('???', '2026-11-26', set()), r'^2026-11-26-tin$')

    def test_vi_page_has_story_og_and_no_image(self):
        item = dict(ITEM, slug='2026-11-26-vang-hoi-phuc', slug_en='2026-11-26-gold-rebounds')
        html = bs.story_page_vi(item)
        self.assertIn('<meta property="og:title" content="Vàng hồi phục nhờ lực mua bắt đáy">', html)
        self.assertIn('og:description" content="Vàng giao ngay quanh 3.569,90 USD/oz. Fed giữ lãi suất."', html)
        self.assertIn('<link rel="canonical" href="https://h79gold.com/tin/2026-11-26-vang-hoi-phuc.html">', html)
        self.assertIn('hreflang="en" href="https://h79gold.com/en/stories/2026-11-26-gold-rebounds.html"', html)
        self.assertNotIn('og:image', html)
        self.assertNotIn('twitter:image', html)
        self.assertNotIn('<img', html)
        self.assertIn('class="sh-story"', html)
        self.assertIn('data-url="https://h79gold.com/tin/2026-11-26-vang-hoi-phuc.html"', html)
        self.assertIn('href="tin-tuc.html"', html)
        self.assertIn('2026-11-26T10:00:00+07:00', html)

    def test_en_page(self):
        item = dict(ITEM, slug='2026-11-26-vang-hoi-phuc', slug_en='2026-11-26-gold-rebounds')
        html = bs.story_page_en(item)
        self.assertIn('<html lang="en"', html)
        self.assertIn('og:title" content="Gold rebounds on bargain hunting"', html)
        self.assertIn('https://h79gold.com/en/stories/2026-11-26-gold-rebounds.html', html)
        self.assertIn('<base href="../../">', html)
        self.assertNotIn('og:image', html)
        self.assertIn('Gold impact:', html)

    def test_write_stories_backfills_slugs_and_cleans_orphans(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            second = dict(ITEM, title='Fed giữ nguyên lãi suất', title_en='', summary_en='')
            (root / 'data' / 'macro-news.json').write_text(json.dumps({'items': [ITEM, second]}, ensure_ascii=False), encoding='utf-8')
            (root / 'tin').mkdir()
            (root / 'tin' / 'orphan.html').write_text('x', encoding='utf-8')
            saved = (bs.ROOT, bs.OUT_TIN, bs.OUT_STORY_EN, bs.TODAY)
            bs.ROOT, bs.OUT_TIN, bs.OUT_STORY_EN, bs.TODAY = root, root / 'tin', root / 'en' / 'stories', '2026-11-27'
            try:
                urls = bs.write_stories()
                first = sorted(p.name for p in (root / 'tin').glob('*.html'))
                again = bs.write_stories()
            finally:
                bs.ROOT, bs.OUT_TIN, bs.OUT_STORY_EN, bs.TODAY = saved
            data = json.loads((root / 'data' / 'macro-news.json').read_text(encoding='utf-8'))
            self.assertEqual(len(first), 2)
            self.assertNotIn('orphan.html', first)
            self.assertEqual(len(list((root / 'en' / 'stories').glob('*.html'))), 1)  # only the item with EN text
            self.assertEqual(len(urls), 3)
            self.assertEqual(urls, again)
            self.assertTrue(all(it['slug'].startswith('2026-11-26-') for it in data['items']))
            self.assertNotIn('slug_en', data['items'][1])

    def test_publish_commit_adds_story_dirs(self):
        text = (SCRIPTS / 'h79_publish.py').read_text(encoding='utf-8')
        self.assertIn("'tin', 'en/stories'", text)

    def test_share_text_in_node(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('node not installed')
        code = (
            "global.document={documentElement:{lang:'vi'},createElement:()=>({}),head:{appendChild(){}},addEventListener(){}};"
            "global.window={};global.navigator={};require(process.argv[1]);"
            "const t=window.HMG.storyText({title:'T',summary:'Một. Hai. Ba.',reason:'Ngắn hạn: A. Dài hạn: B.',url:'https://h79gold.com/tin/x.html'});"
            "process.stdout.write(JSON.stringify(t));"
        )
        out = subprocess.run([node, '-e', code, str(SCRIPTS.parent / 'js' / 'story-share.js')], capture_output=True, text=True, check=True).stdout
        text = json.loads(out)['text']
        self.assertEqual(text, 'T\n\nMột. Hai.\n\nTác động tới vàng: Ngắn hạn: A.\n\nhttps://h79gold.com/tin/x.html')


    def test_homepage_macro_cards_include_share_button(self):
        root = SCRIPTS.parent
        macro = (root / 'js' / 'macro.js').read_text(encoding='utf-8')
        en = (root / 'js' / 'en-pages.js').read_text(encoding='utf-8')
        self.assertIn('${shareBtn(it)}', macro)
        self.assertNotIn('${full ? shareBtn(it)', macro)
        self.assertIn('${shareBtn(it)}', en)
        self.assertNotIn('${full ? shareBtn(it)', en)
        self.assertIn('js/story-share.js', (root / 'index.html').read_text(encoding='utf-8'))
        self.assertIn('js/story-share.js', (root / 'en' / 'index.html').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()

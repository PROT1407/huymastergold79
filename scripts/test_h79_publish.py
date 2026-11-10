#!/usr/bin/env python3
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('h79_publish', ROOT / 'scripts' / 'h79_publish.py')
pub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pub)
seo_spec = importlib.util.spec_from_file_location('build_seo', ROOT / 'scripts' / 'build-seo.py')
seo = importlib.util.module_from_spec(seo_spec)
seo_spec.loader.exec_module(seo)


def payload(task='macro'):
    return {
        'ok': True,
        'task': task,
        'clock': {
            'dateVn': '2026-11-10',
            'timeVn': '06:37',
            'weekdayVn': 'Thứ Ba',
            'timeEn': 'Monday, November 9, 2026, 18:37 EST',
        },
        'sources': [{'name': 'CNBC', 'url': 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html'}],
        'fedwatch': {'stated': True, 'items': [{'name': 'CNBC', 'url': 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html', 'sentence': 'FedWatch 60.3%.'}]},
        'board': {
            'items': [{
                'title': 'Vàng giữ 4.087',
                'summary': 'Spot gần 4.087.',
                'reason': 'Lợi suất dịu.',
                'title_en': 'Gold holds',
                'summary_en': 'Spot near 4,087.',
                'reason_en': 'Yields eased.',
                'category': 'Vàng',
                'impact': 'tăng',
                'source_url': 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html',
            }],
            'share_fb': 'Vàng 4.087',
            'share_zalo': 'Vàng giữ 4.087',
            'analysis': ['SJC bán 147.800.000 đồng/lượng.'],
            'advice': 'Giá bán 147.800.000.',
            'quick_advice': 'SJC 147.800.000.',
            'world_news': [{'text': 'CNBC: vàng gần 4.087 USD.', 'source': {'name': 'CNBC', 'url': 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html'}, 'intl': True}],
        },
    }


class PublishTests(unittest.TestCase):
    def test_schedule_mapping(self):
        self.assertEqual(pub.task_for_schedule('37 23 * * 0-4'), 'macro')
        self.assertEqual(pub.task_for_schedule('43 1 * * 1-5'), 'domestic')
        self.assertEqual(pub.task_for_schedule('0 2 * * 0'), 'weekly')
        self.assertEqual(pub.task_for_schedule('', 'weekly'), 'weekly')

    def test_redact_hides_token(self):
        import os
        old = os.environ.get('H79_RUN_TOKEN')
        os.environ['H79_RUN_TOKEN'] = 'super-secret-token'
        try:
            self.assertNotIn('super-secret-token', pub.redact('token super-secret-token leaked'))
        finally:
            if old is None:
                os.environ.pop('H79_RUN_TOKEN', None)
            else:
                os.environ['H79_RUN_TOKEN'] = old

    def test_macro_is_idempotent_and_prepends(self):
        data = {'items': [{'date': '2026-11-09', 'title': 'old'}]}
        self.assertTrue(pub.apply_macro(data, payload()))
        self.assertEqual(data['items'][0]['date'], '2026-11-10')
        self.assertEqual(data['items'][0]['time_en'], 'Monday, November 9, 2026, 18:37 EST')
        self.assertEqual(data['items'][1]['title'], 'old')
        self.assertFalse(pub.apply_macro(data, payload()))

    def test_fedwatch_without_a_sourced_sentence_is_left_alone(self):
        data = {'meetings': [{'label': 'keep', 'probs': [{'p': 60.3}]}], 'as_of_note': 'old'}
        body = payload()
        body['fedwatch'] = {'stated': False, 'items': []}
        self.assertFalse(pub.apply_fedwatch(data, body))
        self.assertEqual(data['as_of_note'], 'old')
        self.assertEqual(data['meetings'][0]['probs'][0]['p'], 60.3)

    def test_fedwatch_updates_note_not_invented_probabilities(self):
        data = {'meetings': [{'label': 'keep', 'probs': [{'p': 1}]}], 'as_of_note': 'old'}
        self.assertTrue(pub.apply_fedwatch(data, payload()))
        self.assertIn('60.3%', data['as_of_note'])
        self.assertEqual(data['meetings'][0]['probs'][0]['p'], 1)
        self.assertEqual(data['source']['url'], payload()['sources'][0]['url'])

    def test_domestic_prose_must_match_parsed_prices(self):
        rows = [{'buy': 145200000, 'sell': 147800000, 'src_url': 'https://giavang.pnj.com.vn/'}]
        data = {'peak': {'sell': pub.PEAK_SELL, 'date': pub.PEAK_DATE, 'note': 'record'}, 'analysis': ['old']}
        self.assertTrue(pub.apply_domestic_prose(data, payload('domestic'), rows))
        self.assertIn('147.800.000', data['analysis'][0])
        self.assertEqual(data['peak']['date'], pub.PEAK_DATE)
        bad = payload('domestic')
        bad['board']['analysis'] = ['Nhẫn bán 140.000.000.']
        bad['board']['advice'] = 'Nhẫn 140.000.000.'
        bad['board']['quick_advice'] = 'Nhẫn 140.000.000.'
        bad['board']['world_news'] = []
        bad['board']['refs'] = []
        data2 = {'analysis': ['keep me'], 'peak': data['peak']}
        self.assertFalse(pub.apply_domestic_prose(data2, bad, rows))
        self.assertEqual(data2['analysis'], ['keep me'])

    def test_weekly_entry_has_no_trade_box(self):
        body = payload('weekly')
        body['clock']['dateVn'] = '2026-11-15'
        body['board']['title'] = 'Tuần vàng'
        body['board']['title_en'] = 'Gold week'
        body['board']['sections'] = [{'h': 'Tuần', 'p': 'Gold finished near $4,080.'}]
        body['board']['sections_en'] = [{'h': 'Week', 'p': 'Gold finished near $4,080.'}]
        entry = pub.weekly_entry(body)
        self.assertTrue(entry['news'])
        self.assertNotIn('summary', entry)
        self.assertEqual(entry['url'], 'bai/2026-11-15-tong-hop-tin-vang-tuan-qua.html')
        self.assertEqual(entry['url_en'], 'en/posts/2026-11-15-gold-week-news-recap.html')
        original = seo.load
        seo.load = lambda name: {'strategies': [entry]} if name == 'strategies.json' else {}
        try:
            arts = seo.build_strategies()
        finally:
            seo.load = original
        self.assertEqual(arts[0]['file'], '2026-11-15-tong-hop-tin-vang-tuan-qua.html')
        self.assertNotIn('BÁN', arts[0]['body'])
        self.assertNotIn('MUA', arts[0]['body'])

    def test_share_file_and_idempotent_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            (root / 'bai').mkdir()
            (root / 'bai' / '2026-11-10-tin-vi-mo-anh-huong-gia-vang.html').write_text('x', encoding='utf-8')
            self.assertTrue(pub.already_published(root, 'macro', '2026-11-10'))
            share = pub.apply_share({}, 'macro', payload())
            self.assertEqual(share['macro']['facebook'], 'Vàng 4.087')
            self.assertNotIn('H79_RUN_TOKEN', json.dumps(share))


if __name__ == '__main__':
    unittest.main()

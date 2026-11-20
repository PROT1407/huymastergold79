#!/usr/bin/env python3
import importlib.util
import json
import os
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
    def test_previous_quote_is_the_last_entry_before_the_run_date(self):
        data = {'history': {'SJL1L10': [
            {'date': '2026-11-09', 'buy': 138500000, 'sell': 141500000},
            {'date': '2026-11-10', 'buy': 137900000, 'sell': 140900000},
        ], 'SJ9999': [{'date': '2026-11-09', 'buy': 136500000, 'sell': 140500000}]}}
        got = pub.quotes_before(data, '2026-11-10')
        self.assertEqual(got['bar'], {'buy': 138500000, 'sell': 141500000})
        self.assertEqual(got['ring']['sell'], 140500000)
        live = {
            'updated_vn': '08:56 10/11/2026',
            'rows': [
                {'code': 'SJL1L10', 'buy': 138500000, 'sell': 141500000},
                {'code': 'PQHN24NTT', 'buy': 136400000, 'sell': 140600000},
            ],
            'history': {'SJL1L10': [{'date': '2026-11-06', 'buy': 138000000, 'sell': 141000000}]},
        }
        noon = pub.quotes_before(live, '2026-11-10 12:32')
        self.assertEqual(noon['bar']['sell'], 141500000)
        self.assertEqual(noon['ring']['buy'], 136400000)
        self.assertEqual(noon['pnjRing']['buy'], 136400000)
        self.assertIsNone(noon['sjcRing'])
        self.assertEqual(pub.quotes_before(live, '2026-11-10 08:43')['bar']['buy'], 138000000)
        self.assertIsNone(pub.quotes_before({'history': {}}, '2026-11-10'))

    def test_schedule_mapping(self):
        self.assertEqual(pub.task_for_schedule('37 23 * * 0-4'), 'macro')
        self.assertEqual(pub.task_for_schedule('52 22 * * 0-4'), 'macro')
        self.assertEqual(pub.task_for_schedule('43 1 * * 1-5'), 'domestic')
        self.assertEqual(pub.task_for_schedule('13 1 * * 1-5'), 'domestic')
        self.assertEqual(pub.task_for_schedule('0 2 * * 0'), 'weekly')
        self.assertEqual(pub.task_for_schedule('', 'weekly'), 'weekly')

    def test_redact_hides_token(self):
        import os
        old = os.environ.get('H79_RUN_TOKEN')
        os.environ['H79_RUN_TOKEN'] = 'super-secret-token'
        os.environ['RENDER_DEPLOY_HOOK'] = 'https://api.render.com/deploy/srv-abc?key=hook-secret'
        try:
            hidden = pub.redact('token super-secret-token leaked ' + os.environ['RENDER_DEPLOY_HOOK'])
            self.assertNotIn('super-secret-token', hidden)
            self.assertNotIn('hook-secret', hidden)
        finally:
            os.environ.pop('RENDER_DEPLOY_HOOK', None)
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

    def test_main_skips_a_published_board_without_waking(self):
        import io
        from contextlib import redirect_stdout
        _stamp, date = pub.vn_now()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'bai').mkdir()
            (root / 'bai' / f'{date}-gia-vang-trong-nuoc.html').write_text('x', encoding='utf-8')
            (root / 'bai' / f'{date}-tin-vi-mo-anh-huong-gia-vang.html').write_text('x', encoding='utf-8')
            old_root, old_wake = pub.ROOT, pub.wake
            calls = []
            pub.ROOT = root
            pub.wake = lambda *args, **kwargs: calls.append('wake')
            try:
                buf = io.StringIO()
                with redirect_stdout(buf):
                    domestic = pub.main(['domestic'])
                    macro = pub.main(['macro'])
            finally:
                pub.ROOT = old_root
                pub.wake = old_wake
            log = buf.getvalue()
            self.assertEqual(domestic, 0)
            self.assertEqual(macro, 0)
            self.assertEqual(calls, [])
            self.assertIn(f'domestic {date} already published', log)
            self.assertIn(f'macro {date} already published', log)
            self.assertIn('datetime_vn=', log)


class PostRetryTests(unittest.TestCase):
    def setUp(self):
        self._token = os.environ.get('H79_RUN_TOKEN')
        os.environ['H79_RUN_TOKEN'] = 'test-token'

    def tearDown(self):
        if self._token is None:
            os.environ.pop('H79_RUN_TOKEN', None)
        else:
            os.environ['H79_RUN_TOKEN'] = self._token

    def test_wake_polls_for_ten_minutes_then_accepts_health(self):
        import urllib.error
        attempts = []

        class Resp:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def opener(url, timeout=0):
            attempts.append(timeout)
            if len(attempts) < 3:
                raise urllib.error.URLError('asleep')
            return Resp()

        sleeps = []
        logs = []
        pub.wake('https://h79-ai-server.onrender.com', opener=opener, sleep=sleeps.append, log=logs.append, hook='')
        self.assertEqual(attempts, [pub.WAKE_TIMEOUT_S, pub.WAKE_TIMEOUT_S, pub.WAKE_TIMEOUT_S])
        self.assertEqual(sleeps, [pub.WAKE_INTERVAL_S, pub.WAKE_INTERVAL_S])
        self.assertIn('generator health attempt 1 failed: URLError', logs)
        self.assertIn('generator health ok on attempt 3', logs)
        self.assertNotIn('test-token', '\n'.join(logs))

    def test_wake_stops_after_ten_minutes(self):
        now = {'t': 0}

        def clock():
            return now['t']

        def sleep(seconds):
            self.assertEqual(seconds, pub.WAKE_INTERVAL_S)
            now['t'] += seconds

        def opener(url, timeout=0):
            raise TimeoutError('asleep')

        with self.assertRaises(SystemExit) as raised:
            pub.wake('https://h79-ai-server.onrender.com', opener=opener, sleep=sleep, clock=clock, log=lambda _line: None, hook='')
        self.assertIn('generator health check failed', str(raised.exception))
        self.assertGreaterEqual(now['t'], pub.WAKE_LIMIT_S)
        self.assertEqual(pub.WAKE_LIMIT_S, 600)
        self.assertEqual(pub.POST_TIMEOUT_S, 180)

    def test_502_and_503_stay_asleep_until_health_is_200(self):
        import urllib.error

        class Resp:
            def __init__(self, status):
                self.status = status

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        answers = [502, 503]
        calls = []

        def opener(url, timeout=0):
            calls.append(url)
            if answers:
                status = answers.pop(0)
                if status == 503:
                    raise urllib.error.HTTPError(url, 503, 'unavailable', {}, None)
                return Resp(status)
            return Resp(200)

        logs = []
        pub.wake('https://h79-ai-server.onrender.com', opener=opener, sleep=lambda _seconds: None, log=logs.append, hook='')
        self.assertEqual(len(calls), 3)
        self.assertIn('generator health attempt 1 asleep (502)', logs)
        self.assertIn('generator health attempt 2 asleep (503)', logs)
        self.assertIn('generator health ok on attempt 3', logs)
        self.assertNotIn('deploy hook', '\n'.join(logs))

    def test_deploy_hook_fires_once_after_four_minutes_and_is_not_logged(self):
        import urllib.error
        now = {'t': 0}
        hook = 'https://api.render.com/deploy/srv-abc?key=do-not-print'
        calls = []

        class Resp:
            def __init__(self, status):
                self.status = status

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def clock():
            return now['t']

        def sleep(seconds):
            now['t'] += seconds

        def opener(url, timeout=0):
            calls.append(url)
            if url == hook:
                return Resp(202)
            if now['t'] < 300:
                raise urllib.error.HTTPError(url, 503, 'unavailable', {}, None)
            return Resp(200)

        logs = []
        pub.wake(
            'https://h79-ai-server.onrender.com',
            opener=opener,
            sleep=sleep,
            clock=clock,
            log=logs.append,
            hook=hook,
        )
        text = '\n'.join(logs)
        self.assertEqual(calls.count(hook), 1)
        self.assertGreaterEqual(now['t'], pub.WAKE_HOOK_AFTER_S)
        self.assertIn('asleep (503)', text)
        self.assertIn('render deploy hook called (202)', text)
        self.assertNotIn('do-not-print', text)
        self.assertNotIn(hook, text)

    def test_missing_deploy_hook_is_skipped_for_the_full_wait(self):
        import urllib.error
        now = {'t': 0}
        calls = []
        old = os.environ.pop('RENDER_DEPLOY_HOOK', None)

        def clock():
            return now['t']

        def sleep(seconds):
            now['t'] += seconds

        def opener(url, timeout=0):
            calls.append(url)
            raise urllib.error.HTTPError(url, 503, 'unavailable', {}, None)

        try:
            with self.assertRaises(SystemExit) as raised:
                pub.wake('https://h79-ai-server.onrender.com', opener=opener, sleep=sleep, clock=clock, log=lambda _line: None)
        finally:
            if old is not None:
                os.environ['RENDER_DEPLOY_HOOK'] = old
        self.assertIn('generator health check failed', str(raised.exception))
        self.assertGreaterEqual(now['t'], pub.WAKE_LIMIT_S)
        self.assertTrue(all(url.endswith('/health') for url in calls))
        self.assertGreater(len(calls), 1)

    def test_503_then_success_waits_and_returns_the_board(self):
        import io
        import urllib.error
        calls = []
        sleeps = []

        class Body(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def opener(req, timeout=0):
            calls.append(timeout)
            if len(calls) < 3:
                raise urllib.error.HTTPError(req.full_url, 503, 'down', {}, None)
            return Body(json.dumps(payload()).encode())

        got = pub.post_board('https://h79.example', 'macro', '2026-11-10 06:37', opener=opener, sleep=sleeps.append)
        self.assertEqual(calls, [180, 180, 180])
        self.assertEqual(sleeps, [90, 150])
        self.assertTrue(got['ok'])
        self.assertIn('board', got)

    def test_422_fails_immediately_and_three_503s_give_up(self):
        import urllib.error
        calls = []

        def reject(req, timeout=0):
            calls.append(req.full_url)
            raise urllib.error.HTTPError(req.full_url, 422, 'no', {}, None)

        with self.assertRaises(SystemExit) as early:
            pub.post_board('https://h79.example', 'macro', '2026-11-10 06:37', opener=reject, sleep=lambda seconds: (_ for _ in ()).throw(AssertionError(seconds)))
        self.assertIn('422', str(early.exception))
        self.assertEqual(len(calls), 1)

        def always_down(req, timeout=0):
            raise urllib.error.HTTPError(req.full_url, 503, 'down', {}, None)

        slept = []
        with self.assertRaises(SystemExit) as gave_up:
            pub.post_board('https://h79.example', 'weekly', '2026-11-15 09:00', opener=always_down, sleep=slept.append)
        self.assertIn('after 3 tries', str(gave_up.exception))
        self.assertEqual(slept, [90, 150])


if __name__ == '__main__':
    unittest.main()

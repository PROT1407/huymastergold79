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
        data2 = {'analysis': ['keep me'], 'advice': 'keep me', 'quick_advice': 'keep me', 'peak': data['peak']}
        import io
        from contextlib import redirect_stdout
        with redirect_stdout(io.StringIO()):
            self.assertTrue(pub.apply_domestic_prose(data2, bad, rows))
        self.assertNotIn('140.000.000', data2['analysis'][0])
        self.assertNotIn('keep me', data2['analysis'][0])
        self.assertIn('147.800.000', data2['analysis'][0])
        self.assertEqual(data2['refs'], [])

    def test_derived_amounts_are_kept_and_stale_prose_is_replaced(self):
        import io
        from contextlib import redirect_stdout
        rows = [
            {'code': 'SJL1L10', 'buy': 145200000, 'sell': 147800000, 'prev_buy': 147200000, 'prev_sell': 149800000, 'prev_date': '2026-11-09'},
            {'code': 'SJ9999', 'buy': 144000000, 'sell': 147000000, 'prev_buy': 145000000, 'prev_sell': 148000000, 'prev_date': '2026-11-09'},
            {'code': 'PQHN24NTT', 'buy': 143500000, 'sell': 146500000, 'prev_buy': 144500000, 'prev_sell': 147500000, 'prev_date': '2026-11-09'},
        ]
        stale = {
            'analysis': ['Sáng 11/11 SJC bán 136.500.000.'],
            'advice': 'Lời ngày 11/11.',
            'quick_advice': 'Cũ 11/11.',
            'refs': [{'name': 'VTC', 'url': 'https://vtcnews.vn/11-11', 'facts': ['11/11: 136.500.000']}],
            'world': {'vnd_per_luong': 109460000, 'gap_sjc_sell': 38340000},
            'peak': {'sell': pub.PEAK_SELL, 'buy': 188300000, 'date': pub.PEAK_DATE},
        }
        body = payload('domestic')
        body['board']['analysis'] = ['Quy đổi thế giới ≈ 109,5 triệu đồng/lượng, chênh SJC bán khoảng 38,3 triệu.']
        body['board']['advice'] = 'Đỉnh 191,3 triệu ngày 29/01/2026, bán lại lỗ khoảng 46,1 triệu đồng/lượng.'
        body['board']['quick_advice'] = 'So với hôm qua miếng bán giảm 2.000.000 đồng.'
        body['board']['world_news'] = []
        body['board']['refs'] = []
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertTrue(pub.apply_domestic_prose(stale, body, rows))
        self.assertNotIn('warning:', buf.getvalue())
        self.assertIn('109,5 triệu', stale['analysis'][0])
        self.assertIn('191,3 triệu', stale['advice'])
        self.assertIn('2.000.000', stale['quick_advice'])
        self.assertNotIn('11/11', json.dumps(stale['analysis'] + [stale['advice'], stale['quick_advice']], ensure_ascii=False))
        self.assertEqual(stale['refs'], [])
        rejected = payload('domestic')
        rejected['board']['analysis'] = ['Sáng 11/11 SJC bán 140.000.000.']
        rejected['board']['advice'] = 'Nhẫn 140.000.000.'
        rejected['board']['quick_advice'] = 'Nhẫn 140.000.000.'
        rejected['board']['world_news'] = []
        stale2 = {
            'analysis': ['Sáng 11/11 SJC bán 136.500.000.'],
            'advice': 'Lời ngày 11/11.',
            'quick_advice': 'Cũ 11/11.',
            'refs': [{'name': 'VTC', 'url': 'https://vtcnews.vn/11-11', 'facts': ['11/11: 136.500.000']}],
            'world': stale['world'],
            'peak': stale['peak'],
        }
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertTrue(pub.apply_domestic_prose(stale2, rejected, rows))
        self.assertIn('warning:', buf.getvalue())
        self.assertIn('dropped stale refs', buf.getvalue())
        written = json.dumps(stale2['analysis'] + [stale2['advice'], stale2['quick_advice']], ensure_ascii=False)
        self.assertNotIn('11/11', written)
        self.assertNotIn('140.000.000', written)
        self.assertNotIn('136.500.000', written)
        self.assertIn('SJC miếng', stale2['analysis'][0])
        self.assertIn('nhẫn SJC', stale2['analysis'][0])
        self.assertIn('PNJ 24K', stale2['analysis'][0])
        self.assertIn('109,5 triệu', stale2['analysis'][0])
        self.assertIn('38,3 triệu', stale2['analysis'][0])
        self.assertEqual(stale2['refs'], [])

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
            old_root, old_wake, old_scan = pub.ROOT, pub.wake, pub.scan_macro_candidates
            calls = []
            pub.ROOT = root
            pub.wake = lambda *args, **kwargs: calls.append('wake')
            pub.scan_macro_candidates = lambda *a, **k: ([], 'none')
            try:
                buf = io.StringIO()
                with redirect_stdout(buf):
                    domestic = pub.main(['domestic'])
                    macro = pub.main(['macro'])
            finally:
                pub.ROOT, pub.wake, pub.scan_macro_candidates = old_root, old_wake, old_scan
            log = buf.getvalue()
            self.assertEqual(domestic, 0)
            self.assertEqual(macro, 0)
            self.assertEqual(calls, [])
            self.assertIn(f'domestic {date} already published', log)
            self.assertIn('no new candidate stories', log)
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
        self.assertEqual(pub.POST_TIMEOUT_S, 360)

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
        self.assertEqual(calls, [360, 360, 360])
        self.assertEqual(sleeps, [60, 90])
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
        self.assertIn('after 5 tries', str(gave_up.exception))
        self.assertEqual(slept, [60, 90, 150, 180])


class FixedNow:
    """Stand-in for h79_publish.datetime with a fixed VN clock."""
    def __init__(self, stamp):
        from datetime import datetime as real
        self.real = real
        self.value = real.strptime(stamp, '%Y-%m-%d %H:%M').replace(tzinfo=pub.VN)

    def now(self, tz=None):
        return self.value

    def strptime(self, *args):
        return self.real.strptime(*args)


def story(title, url, title_en='', summary=''):
    p = payload()
    p['sources'] = [{'name': 'Kitco', 'url': url}]
    p['board']['items'] = [{
        'title': title, 'summary': summary or title, 'reason': 'r', 'title_en': title_en, 'summary_en': '', 'reason_en': '',
        'category': 'Fed', 'impact': 'giảm', 'source_url': url,
    }]
    return p


class MacroSlotTests(unittest.TestCase):
    def test_new_crons_map_to_macro_and_old_ones_unchanged(self):
        self.assertEqual(pub.task_for_schedule('7 5 * * 1-5'), 'macro')
        self.assertEqual(pub.task_for_schedule('7 5 * * *'), 'macro')
        self.assertEqual(pub.task_for_schedule('37 23 * * *'), 'macro')
        self.assertEqual(pub.task_for_schedule('17 12 * * 1-5'), 'macro')
        self.assertEqual(pub.task_for_schedule('33 19 * * *'), 'macro')
        self.assertEqual(pub.task_for_schedule('22 2 * * *'), 'macro')
        self.assertEqual(pub.task_for_schedule('47 8 * * *'), 'macro')
        self.assertEqual(pub.task_for_schedule('27 15 * * *'), 'macro')
        self.assertEqual(pub.task_for_schedule('13 1 * * 1-5'), 'domestic')
        self.assertEqual(pub.task_for_schedule('0 2 * * 0'), 'weekly')
        self.assertEqual(pub.task_for_schedule('0 12 * * 1-5'), '')

    def test_slot_follows_the_vn_clock_when_the_run_starts(self):
        from datetime import datetime
        at = lambda h, m=0: datetime(2026, 11, 24, h, m, tzinfo=pub.VN)
        self.assertEqual(pub.macro_slot(at(0, 0)), 'dem')
        self.assertEqual(pub.macro_slot(at(4, 59)), 'dem')
        self.assertEqual(pub.macro_slot(at(5, 52)), 'sang')
        self.assertEqual(pub.macro_slot(at(10, 59)), 'sang')
        self.assertEqual(pub.macro_slot(at(11, 0)), 'trua')
        self.assertEqual(pub.macro_slot(at(16, 59)), 'trua')
        self.assertEqual(pub.macro_slot(at(17, 0)), 'toi')
        self.assertEqual(pub.macro_slot(at(23, 59)), 'toi')

    def write_macro(self, root, items):
        (root / 'data').mkdir(exist_ok=True)
        pub.write_json(root / 'data' / 'macro-news.json', {'items': items})

    def test_gate_allows_any_hour_and_a_repeat_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_macro(root, [{'date': '2026-11-23', 'title': 'hôm qua'}])
            self.assertEqual(pub.macro_gate(root, '2026-11-24', '2026-11-24 06:40', 'sang')[:2], (True, True))
            self.assertEqual(pub.macro_gate(root, '2026-11-24', '2026-11-24 01:10', 'dem')[:2], (True, True))
            self.write_macro(root, [{'date': '2026-11-24', 'title': 'a', 'time_vn': 'Thứ Ba 24/11/2026 11:33 giờ VN'}])
            self.assertEqual(pub.item_published({'date': '2026-11-24', 'time_vn': 'Thứ Ba 24/11/2026 11:33 giờ VN'}), '2026-11-24 11:33')
            go, first, reason = pub.macro_gate(root, '2026-11-24', '2026-11-24 11:50', 'sang')
            self.assertEqual((go, first), (True, False))
            self.assertIn('extra update', reason)
            self.assertTrue(pub.macro_gate(root, '2026-11-24', '2026-11-24 13:00', 'trua')[0])
            self.write_macro(root, [
                {'date': '2026-11-24', 'title': 'b', 'slot': 'trua', 'published_vn': '2026-11-24 15:10'},
                {'date': '2026-11-24', 'title': 'a', 'slot': 'sang', 'published_vn': '2026-11-24 06:40'},
            ])
            self.assertTrue(pub.macro_gate(root, '2026-11-24', '2026-11-24 16:30', 'trua')[0])
            self.assertTrue(pub.macro_gate(root, '2026-11-24', '2026-11-24 17:30', 'toi')[0])
            self.assertTrue(pub.macro_gate(root, '2026-11-25', '2026-11-25 01:15', 'dem')[0])

    def test_page_without_json_items_can_still_take_an_update(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_macro(root, [])
            (root / 'bai').mkdir()
            (root / 'bai' / '2026-11-24-tin-vi-mo-anh-huong-gia-vang.html').write_text('x', encoding='utf-8')
            go, first, reason = pub.macro_gate(root, '2026-11-24', '2026-11-24 12:10', 'trua')
            self.assertEqual((go, first), (True, True))
            self.assertIn('first update', reason)

    def test_later_update_goes_on_top_and_keeps_the_morning_story(self):
        data = {'items': []}
        morning = story('Vàng giữ 4.087 khi lợi suất dịu', 'https://www.kitco.com/news/article/2026-11-10/a', 'Gold holds as yields ease')
        self.assertTrue(pub.apply_macro(data, morning, slot='sang', published_vn='2026-11-10 06:40'))
        self.assertEqual(data['items'][0]['slot'], 'sang')
        self.assertEqual(data['items'][0]['published_vn'], '2026-11-10 06:40')
        noon = story('Dầu tăng vọt sau căng thẳng Trung Đông, vàng nhích lên', 'https://www.cnbc.com/2026/11/10/oil-jumps.html', 'Oil jumps on Middle East tension')
        self.assertTrue(pub.apply_macro(data, noon, slot='trua', published_vn='2026-11-10 12:30'))
        self.assertEqual([item['slot'] for item in data['items']], ['trua', 'sang'])
        self.assertEqual(data['items'][1]['title'], 'Vàng giữ 4.087 khi lợi suất dịu')

    def test_repeats_by_url_or_headline_are_dropped(self):
        data = {'items': [{'date': '2026-11-09', 'title': 'Fed giữ lãi suất', 'source': {'url': 'https://x.com/old'}}]}
        self.assertTrue(pub.apply_macro(data, story('Vàng giữ 4.087 khi lợi suất dịu', 'https://www.kitco.com/news/article/2026-11-10/a', 'Gold holds as yields ease'), slot='sang', published_vn='2026-11-10 06:40'))
        before = json.dumps(data, sort_keys=True)
        same_url = story('Tiêu đề khác hẳn về chứng khoán', 'https://www.kitco.com/news/article/2026-11-10/a')
        self.assertFalse(pub.apply_macro(data, same_url, slot='trua', published_vn='2026-11-10 12:30'))
        reworded = story('Vàng giữ mốc 4.087 khi lợi suất dịu', 'https://www.cnbc.com/2026/11/10/b.html')
        self.assertFalse(pub.apply_macro(data, reworded, slot='trua', published_vn='2026-11-10 12:30'))
        english = story('Tin hoàn toàn khác', 'https://www.cnbc.com/2026/11/10/c.html', 'Gold holds as yields ease')
        self.assertFalse(pub.apply_macro(data, english, slot='trua', published_vn='2026-11-10 12:30'))
        yesterday = story('Một tin mới', 'https://x.com/old')
        self.assertFalse(pub.apply_macro(data, yesterday, slot='trua', published_vn='2026-11-10 12:30'))
        self.assertEqual(json.dumps(data, sort_keys=True), before)
        mixed = story('Vàng giữ 4.087 khi lợi suất dịu', 'https://www.kitco.com/news/article/2026-11-10/a')
        mixed['sources'].append({'name': 'CNBC', 'url': 'https://www.cnbc.com/2026/11/10/oil.html'})
        mixed['board']['items'].append({'title': 'Dầu tăng vọt sau căng thẳng Trung Đông', 'summary': 'Dầu Brent tăng.', 'category': 'Dầu mỏ', 'source_url': 'https://www.cnbc.com/2026/11/10/oil.html'})
        self.assertTrue(pub.apply_macro(data, mixed, slot='trua', published_vn='2026-11-10 12:30'))
        today = [item['title'] for item in data['items'] if item['date'] == '2026-11-10']
        self.assertEqual(today, ['Dầu tăng vọt sau căng thẳng Trung Đông', 'Vàng giữ 4.087 khi lợi suất dịu'])

    def run_main(self, root, stamp, board, schedule='7 5 * * 1-5', precheck=('https://www.cnbc.com/2026/11/24/new.html',), precheck_status='new'):
        import io
        from contextlib import redirect_stdout
        saved = (pub.ROOT, pub.wake, pub.post_board, pub.datetime, pub.scan_macro_candidates, os.environ.get('GITHUB_EVENT_SCHEDULE'), os.environ.get('H79_TASK'))
        calls = []
        pub.ROOT = root
        pub.wake = lambda *a, **k: calls.append('wake')
        pub.post_board = lambda *a, **k: (calls.append('post'), board)[1]
        pub.scan_macro_candidates = lambda *a, **k: (list(precheck), precheck_status)
        pub.datetime = FixedNow(stamp)
        os.environ['GITHUB_EVENT_SCHEDULE'] = schedule
        os.environ.pop('H79_TASK', None)
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                code = pub.main([])
        finally:
            pub.ROOT, pub.wake, pub.post_board, pub.datetime, pub.scan_macro_candidates = saved[:5]
            for key, value in (('GITHUB_EVENT_SCHEDULE', saved[5]), ('H79_TASK', saved[6])):
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
        return code, calls, buf.getvalue()

    def test_main_noon_run_with_nothing_new_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_macro(root, [{
                'date': '2026-11-24', 'title': 'Vàng giữ 4.087 khi lợi suất dịu', 'slot': 'sang', 'published_vn': '2026-11-24 06:40',
                'source': {'url': 'https://www.kitco.com/news/article/2026-11-24/a'},
            }])
            before = (root / 'data' / 'macro-news.json').read_text(encoding='utf-8')
            board = story('Vàng giữ 4.087 khi lợi suất dịu', 'https://www.kitco.com/news/article/2026-11-24/a')
            board['clock']['dateVn'] = '2026-11-24'
            code, calls, log = self.run_main(root, '2026-11-24 12:20', board)
            self.assertEqual(code, 0)
            self.assertEqual(calls, ['wake', 'post'])
            self.assertIn('no new stories', log)
            self.assertEqual((root / 'data' / 'macro-news.json').read_text(encoding='utf-8'), before)
            self.assertFalse((root / 'data' / 'latest-share.json').exists())

    def test_main_skips_without_waking_when_precheck_finds_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_macro(root, [{'date': '2026-11-24', 'title': 'a', 'slot': 'sang', 'published_vn': '2026-11-24 10:30'}])
            code, calls, log = self.run_main(root, '2026-11-24 12:20', {}, precheck=(), precheck_status='none')
            self.assertEqual((code, calls), (0, []))
            self.assertIn('no new candidate stories', log)
            code, calls, log = self.run_main(root, '2026-11-25 01:15', {}, schedule='17 12 * * 1-5', precheck=(), precheck_status='none')
            self.assertEqual((code, calls), (0, []))
            self.assertIn('first update (dem)', log)
            self.assertIn('no new candidate stories', log)

    def test_weekend_and_late_night_runs_still_publish_new_stories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_macro(root, [{'date': '2026-11-28', 'title': 'a', 'slot': 'sang', 'published_vn': '2026-11-28 10:30'}])
            board = story('Dầu tăng vọt cuối tuần', 'https://www.cnbc.com/2026/11/28/oil.html')
            board['clock']['dateVn'] = '2026-11-28'
            code, calls, log = self.run_main(root, '2026-11-28 12:20', {}, schedule='7 5 * * *', precheck=(), precheck_status='none')
            self.assertEqual((code, calls), (0, []))
            self.assertIn('no new candidate stories', log)
            code, calls, log = self.run_main(root, '2026-11-28 19:30', board, schedule='17 12 * * *')
            self.assertEqual(code, 1)  # stops at build-seo in the temp dir, after the story was written
            self.assertEqual(calls, ['wake', 'post'])
            data = json.loads((root / 'data' / 'macro-news.json').read_text(encoding='utf-8'))
            self.assertEqual([item['slot'] for item in data['items']], ['toi', 'sang'])
            night = story('Fed ra thông báo đêm', 'https://www.federalreserve.gov/newsevents/pressreleases/2026-11-29-a.htm')
            night['clock']['dateVn'] = '2026-11-29'
            self.write_macro(root, [])
            code, calls, log = self.run_main(root, '2026-11-29 01:15', night, schedule='33 19 * * *')
            self.assertEqual(calls, ['wake', 'post'])
            data = json.loads((root / 'data' / 'macro-news.json').read_text(encoding='utf-8'))
            self.assertEqual(data['items'][0]['slot'], 'dem')

    def test_precheck_compares_index_links_with_the_board(self):
        import io

        class Body(io.BytesIO):
            def __init__(self, data, url):
                super().__init__(data)
                self.url = url

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        pages = {
            'https://www.kitco.com/news': b'<a href="/news/article/2026-11-24/old">old</a><a href="/news/article/2026-11-24/new">new</a>',
            'https://www.kitco.com/news/rss': b'<link>https://www.kitco.com/news/article/2026-11-24/new</link>',
        }

        def opener(req, timeout=0):
            url = getattr(req, 'full_url', None) or req
            if url not in pages:
                raise OSError('skip')
            return Body(pages[url], url)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_macro(root, [{
                'date': '2026-11-24',
                'title': 'old',
                'source': {'url': 'https://www.kitco.com/news/article/2026-11-24/old'},
            }])
            logs = []
            found, status = pub.scan_macro_candidates(root, '2026-11-24', opener=opener, log=logs.append)
            self.assertEqual(status, 'new')
            self.assertEqual(found, ['https://www.kitco.com/news/article/2026-11-24/new'])
            self.write_macro(root, [
                {'date': '2026-11-24', 'title': 'old', 'source': {'url': 'https://www.kitco.com/news/article/2026-11-24/old'}},
                {'date': '2026-11-24', 'title': 'new', 'source': {'url': 'https://www.kitco.com/news/article/2026-11-24/new'}},
            ])
            found, status = pub.scan_macro_candidates(root, '2026-11-24', opener=opener, log=logs.append)
            self.assertEqual((found, status), ([], 'none'))

        def always_fail(req, timeout=0):
            raise OSError('down')

        found, status = pub.scan_macro_candidates(Path('/tmp'), '2026-11-24', opener=always_fail, log=logs.append)
        self.assertEqual((found, status), ([], 'error'))

    def test_422_reason_is_logged_without_secrets(self):
        import io
        import urllib.error
        body = json.dumps({'ok': False, 'error': 'Không có bài báo cùng ngày hoặc gần đây.', 'debug': {'detail': 'no articles', 'failedNumbers': []}}).encode()
        exc = urllib.error.HTTPError('https://h79.example/api/boards', 422, 'no', {}, io.BytesIO(body))
        reason = pub.generator_reason(exc)
        self.assertIn('no articles', reason)
        self.assertIn('Không có bài báo', reason)

    def test_502_reason_is_logged_on_retry(self):
        import io
        import urllib.error
        from contextlib import redirect_stdout
        body = json.dumps({'ok': False, 'error': 'Không tạo được bản tin lúc này. Vui lòng thử lại sau.', 'debug': {'detail': 'gemini_failed', 'status': 503}}).encode()
        calls = []

        def always_down(req, timeout=0):
            calls.append(timeout)
            raise urllib.error.HTTPError(req.full_url, 502, 'bad gateway', {}, io.BytesIO(body))

        buf = io.StringIO()
        token = os.environ.get('H79_RUN_TOKEN')
        os.environ['H79_RUN_TOKEN'] = 'test-token'
        try:
            with redirect_stdout(buf), self.assertRaises(SystemExit) as gave_up:
                pub.post_board('https://h79.example', 'macro', '2026-11-24 22:30', opener=always_down, sleep=lambda _s: None)
        finally:
            if token is None:
                os.environ.pop('H79_RUN_TOKEN', None)
            else:
                os.environ['H79_RUN_TOKEN'] = token
        self.assertIn('after 5 tries (502)', str(gave_up.exception))
        self.assertEqual(len(calls), 5)
        self.assertIn('gemini_failed', buf.getvalue())
        self.assertIn('status=503', buf.getvalue())


if __name__ == '__main__':
    unittest.main()

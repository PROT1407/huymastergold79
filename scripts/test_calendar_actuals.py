#!/usr/bin/env python3
"""Offline tests for the US calendar refresh and actual fill. No network."""
import datetime as dt
import importlib.util
import json
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

import calendar_actuals as actuals
import calendar_io

ROOT = Path(__file__).resolve().parents[1]
VN = ZoneInfo('Asia/Ho_Chi_Minh')
NOW = dt.datetime(2026, 11, 11, 1, 0, tzinfo=dt.timezone.utc)


def load_update():
    path = Path(__file__).with_name('update-calendar.py')
    spec = importlib.util.spec_from_file_location('update_calendar', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


UPDATE = load_update()


def bls_page(year, cells):
    body = ''.join(f'<TD>{cell}</TD>' for cell in cells)
    return (
        '<TABLE id="table0"><TR><TH scope="row">Year</TH></TR>'
        f'<TR><TH scope="row">{year}</TH>{body}</TR></TABLE>'
    )


class ClassifyTests(unittest.TestCase):
    def test_core_before_headline(self):
        self.assertEqual(actuals.classify('Core CPI m/m'), 'core_cpi_mm')
        self.assertEqual(actuals.classify('CPI m/m'), 'cpi_mm')
        self.assertEqual(actuals.classify('CPI y/y'), 'cpi_yy')
        self.assertEqual(actuals.classify('Core PPI m/m'), 'core_ppi_mm')
        self.assertEqual(actuals.classify('PPI m/m'), 'ppi_mm')
        self.assertEqual(actuals.classify('Core PCE Price Index m/m'), 'core_pce_mm')
        self.assertEqual(actuals.classify('Advance GDP q/q'), 'gdp_advance')
        self.assertEqual(actuals.classify('Prelim GDP q/q'), 'gdp_second')
        self.assertEqual(actuals.classify('Final GDP q/q'), 'gdp_third')
        self.assertIsNone(actuals.classify('Fed Chair Speaks'))
        self.assertEqual(actuals.classify('Unemployment Claims'), 'claims')
        self.assertEqual(actuals.classify('Unemployment Rate'), 'unemployment')

    def test_reference_periods(self):
        cpi = dt.datetime(2026, 11, 10, 13, 30, tzinfo=dt.timezone.utc)
        self.assertEqual(actuals.reference('cpi_mm', cpi), ('month', 2026, 10))
        gdp = dt.datetime(2026, 10, 29, 12, 30, tzinfo=dt.timezone.utc)
        self.assertEqual(actuals.reference('gdp_advance', gdp), ('quarter', 2026, 3, 'advance'))
        claims = dt.datetime(2026, 11, 12, 13, 30, tzinfo=dt.timezone.utc)
        self.assertEqual(actuals.reference('claims', claims), ('week', dt.date(2026, 11, 7)))
        self.assertEqual(actuals.claims_week_ending(dt.date(2026, 11, 13)), dt.date(2026, 11, 7))


class BlsParseTests(unittest.TestCase):
    def test_october_cpi_cells_and_missing(self):
        cells = ['0.2', '0.3', '0.9', '0.6', '0.5', '-0.4', '0.1', '0.4', '0.6', '0.4', '', '']
        page = bls_page(2026, cells)
        self.assertEqual(actuals.bls_month_cell(page, 2026, 10), '0.4')
        self.assertEqual(actuals.bls_month_cell(page, 2026, 9), '0.6')
        self.assertIsNone(actuals.bls_month_cell(page, 2026, 11))
        self.assertEqual(actuals.format_cell('0.4', 'percent'), '0.4%')
        self.assertEqual(actuals.format_cell('-0.4', 'percent'), '-0.4%')

    def test_preliminary_footnote_and_unavailable(self):
        cells = [''] * 12
        cells[8] = '1.3(P)'
        cells[9] = '&nbsp;(X)'
        page = bls_page(2026, cells)
        self.assertEqual(actuals.format_cell(actuals.bls_month_cell(page, 2026, 9), 'percent'), '1.3%')
        self.assertIsNone(actuals.bls_month_cell(page, 2026, 10))

    def test_nfp_thousands_not_rounded(self):
        self.assertEqual(actuals.format_cell('165', 'thousands'), '165K')
        self.assertEqual(actuals.format_cell('-10', 'thousands'), '-10K')
        self.assertIsNone(actuals.format_cell('165.4', 'thousands'))
        self.assertIsNone(actuals.one_decimal_percent('0.35'))


class CnbcParseTests(unittest.TestCase):
    def test_cpi_uses_actual_not_forecast_or_prior_month(self):
        title = 'Consumer prices rose 0.4% in October, more than expected'
        body = (
            'The consumer price index increased a seasonally adjusted 0.4% for the month. '
            'Core CPI, which strips out food and energy, increased 0.3%. '
            'Economists had forecast a 0.2% gain. '
            'The headline CPI had increased 0.6% in September while core was up 0.3%.'
        )
        parsed = actuals.parse_cnbc(title, body, 'October')
        self.assertEqual(parsed['cpi_mm'], '0.4%')
        self.assertEqual(parsed['core_cpi_mm'], '0.3%')
        self.assertNotIn('cpi_yy', parsed)

    def test_preview_title_is_ignored(self):
        parsed = actuals.parse_cnbc(
            'What to expect from the October CPI report',
            'Consumer prices rose 0.9% in October.', 'October')
        self.assertEqual(parsed, {})

    def test_jobs_and_wages(self):
        title = 'U.S. economy added 165,000 jobs in October; unemployment rate slips to 4.1%'
        body = 'Average hourly earnings increased 0.4% on the month and 3.1% annually, compared with estimates for 0.3% and 2.9%.'
        parsed = actuals.parse_cnbc(title, body, 'October')
        self.assertEqual(parsed['nfp'], '165K')
        self.assertEqual(parsed['unemployment'], '4.1%')
        self.assertEqual(parsed['ahe_mm'], '0.4%')
        self.assertEqual(parsed['ahe_yy'], '3.1%')

    def test_retail_headline_is_not_the_core_print(self):
        title = 'Retail sales rose 0.8% in September'
        body = 'Core retail sales rose 0.9%.'
        parsed = actuals.parse_cnbc(title, body, 'September')
        self.assertEqual(parsed['retail_mm'], '0.8%')
        self.assertEqual(parsed['core_retail_mm'], '0.9%')

    def test_two_cpi_prints_are_not_guessed(self):
        title = 'Consumer prices rose 0.4% in October'
        body = 'Consumer prices rose 0.8% in October according to a separate private gauge.'
        self.assertNotIn('cpi_mm', actuals.parse_cnbc(title, body, 'October'))


class AgencyParseTests(unittest.TestCase):
    def test_fed_upper_bound(self):
        text = ('The Committee decided to maintain the target range for the federal funds rate '
                'at 3-3/4 to 4 percent.')
        self.assertEqual(actuals.parse_funds_range(text), '4.00%')
        self.assertEqual(actuals.parse_funds_range(
            'target range for the federal funds rate at 4 to 4-1/4 percent'), '4.25%')
        self.assertIsNone(actuals.parse_funds_range('the rate was left unchanged'))

    def test_bea_gdp_and_pce(self):
        xml = '''<item><title>GDP (Advance Estimate), 3rd Quarter 2026</title>
        <link>https://www.bea.gov/news/gdp</link>
        <description>Real gross domestic product (GDP) increased at an annual rate of 3.4 percent
        in the third quarter of 2026.</description></item>'''
        self.assertEqual(actuals.parse_bea_gdp(xml)[(2026, 3, 'advance')], '3.4%')
        page = ('PCE price index for September increased 0.5 percent. '
                'Excluding food and energy, the PCE price index increased 0.3 percent. '
                'From the same month one year ago, the PCE price index for September increased 3.6 percent. '
                'Excluding food and energy, the PCE price index increased 3.1 percent from one year ago.')
        parsed = actuals.parse_bea_pce('Personal Income and Outlays, September 2026', page)
        self.assertEqual(parsed[('pce_mm', 2026, 9)], '0.5%')
        self.assertEqual(parsed[('core_pce_mm', 2026, 9)], '0.3%')
        self.assertEqual(parsed[('pce_yy', 2026, 9)], '3.6%')
        self.assertEqual(parsed[('core_pce_yy', 2026, 9)], '3.1%')

    def test_fred_claims_exact_thousands_only(self):
        csv = 'DATE,ICSA\n2026-11-07,220000\n2026-10-31,220500\n'
        found = actuals.parse_fred_claims(csv)
        self.assertEqual(found[dt.date(2026, 11, 7)], '220K')
        self.assertNotIn(dt.date(2026, 10, 31), found)


def event(title, when, actual='', forecast='0.2%', previous='0.1%'):
    moment = dt.datetime.fromisoformat(when.replace('Z', '+00:00')).astimezone(VN)
    return {
        'title': title, 'title_vi': '', 'explain': '', 'explain_en': '', 'impact': 'High',
        'time_utc': when, 'time_vn': moment.strftime('%H:%M %d/%m/%Y'),
        'date_vn': moment.strftime('%Y-%m-%d'), 'forecast': forecast, 'previous': previous,
        'actual': actual,
    }


def shell(events, updated=NOW):
    moment = updated.astimezone(dt.timezone.utc)
    return {
        '_ghi_chu': 'test',
        'source': {'name': 'ForexFactory', 'url': 'https://www.forexfactory.com/calendar',
                   'feed': 'https://example.test/feed.json'},
        'updated_vn': moment.astimezone(VN).strftime('%H:%M %d/%m/%Y'),
        'updated_utc': moment.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'has_actual': any(bool(item.get('actual')) for item in events),
        'events': events,
    }


class ApplyTests(unittest.TestCase):
    def test_keeps_existing_actual_and_skips_future(self):
        doc = shell([
            event('CPI m/m', '2026-11-10T13:30:00Z', actual='0.9%'),
            event('PPI m/m', '2026-11-13T13:30:00Z'),
        ])
        called = []

        def lookup(item):
            called.append(item['title'])
            return '0.4%', 'BLS'

        self.assertEqual(actuals.apply_actuals(doc, NOW, lookup), [])
        self.assertEqual(doc['events'][0]['actual'], '0.9%')
        self.assertEqual(called, [])

    def test_disagreement_leaves_actual_empty(self):
        doc = shell([event('Core CPI m/m', '2026-11-10T13:30:00Z')])
        actuals.apply_actuals(doc, NOW, lambda _event: (None, None))
        self.assertEqual(doc['events'][0]['actual'], '')
        self.assertNotIn('actual_src', doc['events'][0])

    def test_cnbc_confirmed_by_bls_uses_cnbc_label(self):
        doc = shell([
            event('CPI m/m', '2026-11-10T13:30:00Z', forecast='0.3%', previous='0.6%'),
            event('Core CPI m/m', '2026-11-10T13:30:00Z', forecast='0.2%', previous='0.3%'),
        ])
        pages = {
            actuals.CNBC_RSS: (
                '<item><title>Consumer prices rose 0.4% in October, more than expected</title>'
                '<link>https://news.example/cpi</link><description>October CPI</description></item>'
            ),
            'https://news.example/cpi': (
                '<p>The consumer price index increased a seasonally adjusted 0.4% for the month. '
                'Core CPI increased 0.3%.</p>'
            ),
            actuals.bls_url('CUSR0000SA0', 'pct_1mth'): bls_page(
                2026, ['0.2', '0.3', '0.9', '0.6', '0.5', '-0.4', '0.1', '0.4', '0.6', '0.4', '', '']),
            actuals.bls_url('CUSR0000SA0L1E', 'pct_1mth'): bls_page(
                2026, ['0.3', '0.2', '0.2', '0.4', '0.2', '0.0', '0.2', '0.3', '0.3', '0.3', '', '']),
        }

        def get(url):
            if url not in pages:
                raise AssertionError(url)
            return pages[url]

        self.assertTrue(actuals.run(doc, NOW, get))
        by_title = {item['title']: item for item in doc['events']}
        self.assertEqual(by_title['CPI m/m']['actual'], '0.4%')
        self.assertEqual(by_title['CPI m/m']['actual_src'], 'CNBC')
        self.assertEqual(by_title['Core CPI m/m']['actual'], '0.3%')
        self.assertEqual(by_title['Core CPI m/m']['actual_src'], 'CNBC')
        self.assertTrue(doc['has_actual'])

    def test_bls_only_when_cnbc_is_silent(self):
        doc = shell([event('PPI m/m', '2026-11-13T13:30:00Z', forecast='0.4%', previous='1.3%')])
        # Release is still in the future at NOW, so nothing is filled.
        self.assertFalse(actuals.run(doc, NOW, lambda url: (_ for _ in ()).throw(AssertionError(url))))
        later = dt.datetime(2026, 11, 13, 15, 0, tzinfo=dt.timezone.utc)
        cells = ['0.6', '0.5', '0.8', '1.1', '0.5', '-0.1', '0.2', '0.5', '1.3', '0.4', '', '']
        pages = {
            actuals.CNBC_RSS: '<rss></rss>',
            actuals.bls_url('WPSFD4', 'pct_1mth'): bls_page(2026, cells),
        }
        self.assertTrue(actuals.run(doc, later, lambda url: pages[url]))
        self.assertEqual(doc['events'][0]['actual'], '0.4%')
        self.assertEqual(doc['events'][0]['actual_src'], 'BLS')

    def test_conflict_does_not_pick_a_side(self):
        doc = shell([event('CPI m/m', '2026-11-10T13:30:00Z')])
        pages = {
            actuals.CNBC_RSS: (
                '<item><title>Consumer prices rose 0.5% in October</title>'
                '<link>https://news.example/cpi</link><description></description></item>'
            ),
            'https://news.example/cpi': '<p>Consumer prices rose 0.5% in October.</p>',
            actuals.bls_url('CUSR0000SA0', 'pct_1mth'): bls_page(
                2026, [''] * 9 + ['0.4', '', '']),
        }
        self.assertFalse(actuals.run(doc, NOW, lambda url: pages[url]))
        self.assertEqual(doc['events'][0]['actual'], '')


class UpdateScriptTests(unittest.TestCase):
    def feed_from(self, doc):
        raw = []
        for item in doc['events']:
            raw.append({
                'title': item['title'], 'country': 'USD', 'impact': 'High',
                'date': item['time_utc'].replace('Z', '+00:00'),
                'forecast': item['forecast'], 'previous': item['previous'], 'actual': '',
            })
        raw.append({'title': 'German CPI', 'country': 'EUR', 'impact': 'High',
                    'date': '2026-11-10T13:30:00+00:00', 'forecast': '0.2%', 'previous': '0.1%'})
        return raw

    def test_live_file_is_valid_and_idempotent(self):
        text = (ROOT / 'data' / 'calendar-us.json').read_text(encoding='utf-8')
        doc = json.loads(text)
        calendar_io.validate_calendar(doc)
        self.assertEqual(calendar_io.render(doc), text)
        self.assertIsNone(UPDATE.prepare(self.feed_from(doc), doc, NOW))

    def test_empty_feed_does_not_replace_events(self):
        doc = json.loads((ROOT / 'data' / 'calendar-us.json').read_text(encoding='utf-8'))
        with self.assertRaises(ValueError):
            UPDATE.prepare([], doc, NOW)
        with self.assertRaises(ValueError):
            UPDATE.prepare([
                {'title': 'CPI m/m', 'country': 'EUR', 'impact': 'High',
                 'date': '2026-11-10T13:30:00+00:00'}
            ], doc, NOW)

    def test_keeps_sourced_actual_and_changes_timestamp_only_when_needed(self):
        doc = json.loads((ROOT / 'data' / 'calendar-us.json').read_text(encoding='utf-8'))
        doc['events'][0]['actual_src'] = 'CNBC'
        raw = self.feed_from(doc)
        self.assertIsNone(UPDATE.prepare(raw, doc, NOW))
        raw[0]['forecast'] = '9.9%'
        text = UPDATE.prepare(raw, doc, NOW)
        self.assertIsNotNone(text)
        rebuilt = json.loads(text)
        self.assertEqual(rebuilt['events'][0]['forecast'], '9.9%')
        self.assertEqual(rebuilt['events'][0]['actual'], doc['events'][0]['actual'])
        self.assertEqual(rebuilt['events'][0]['actual_src'], 'CNBC')
        self.assertEqual(rebuilt['updated_utc'], NOW.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
        calendar_io.validate_calendar(rebuilt)

    def test_check_rejects_empty_document(self):
        with self.assertRaises(ValueError):
            calendar_io.validate_calendar({'events': []})


if __name__ == '__main__':
    unittest.main()

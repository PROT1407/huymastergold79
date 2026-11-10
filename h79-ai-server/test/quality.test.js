'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { dateWindow, isArticleUrl, isHomepageUrl, pricePathFromFacts, renderPriceLines } = require('../src/collect');
const { contradictsClock, extractNumbers, gate } = require('../src/quality');
const { clockFromVnString } = require('../src/time');

const tuesday = clockFromVnString('2026-11-10 06:37');

test('VN clock minus 12 hours is EST, with the real weekday and year', () => {
  assert.equal(tuesday.weekdayEn, 'Tuesday');
  assert.equal(tuesday.weekdayVn, 'Thứ Ba');
  assert.equal(tuesday.dateEt, '2026-11-09');
  assert.equal(tuesday.weekdayEtEn, 'Monday');
  assert.equal(tuesday.timeEn, 'Monday, November 9, 2026, 18:37 EST');
  assert.equal(tuesday.year, 2026);
  const sunday = clockFromVnString('2026-11-15 09:00');
  assert.deepEqual(dateWindow('weekly', sunday), { start: '2026-11-09', end: '2026-11-13' });
  assert.deepEqual(dateWindow('macro', tuesday), { start: '2026-11-08', end: '2026-11-10' });
  assert.deepEqual(dateWindow('weekly', clockFromVnString('2026-11-08 09:00')), { start: '2026-11-02', end: '2026-11-06' });
});

test('article URLs are not homepages', () => {
  assert.equal(isHomepageUrl('https://www.cnbc.com/gold/'), true);
  assert.equal(isHomepageUrl('https://www.kitco.com/'), true);
  assert.equal(isArticleUrl('https://www.cnbc.com/gold/'), false);
  assert.equal(isArticleUrl('https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html'), true);
  assert.equal(isArticleUrl('https://www.kitco.com/news/article/2026-11-09/gold-holds'), true);
  assert.equal(isArticleUrl('https://www.reuters.com/markets/commodities/gold-holds-2026-11-09/'), true);
  assert.equal(isArticleUrl('https://www.fxstreet.com/news/gold-price-holds-after-payrolls-202611101200'), true);
  assert.equal(isArticleUrl('https://www.federalreserve.gov/newsevents/pressreleases/monetary20261107a.htm'), true);
  assert.equal(isHomepageUrl('https://www.fxstreet.com/news/latest'), true);
  assert.equal(isArticleUrl('http://169.254.169.254/latest/meta-data'), false);
});

test('price lines and the weekly path come from parsed figures', () => {
  const lines = renderPriceLines(
    [{ brand: 'PNJ', type: 'Vàng miếng SJC', buy: 145200000, sell: 147800000, sourceUrl: 'https://edge-api.pnj.io/x' }],
    { xau: 4087.26, gap: 15300000, spotUrl: 'https://api.gold-api.com/price/XAU', fxUrl: 'https://open.er-api.com/v6/latest/USD' },
  );
  assert.match(lines[0], /145\.200\.000/);
  assert.match(lines[1], /4\.087,26/);
  assert.match(lines[2], /15\.300\.000/);
  const path = pricePathFromFacts([
    { sentence: 'Gold election bounce ran from about $3,900 to a high near $4,145.' },
    { sentence: 'The World Bank gold path is $4,600 in 2026, then $4,250 in 2027, and $4,000 in 2028.' },
  ]);
  assert.match(path, /3900 → 4145 → 4600 → 4250 → 4000/);
});

test('wrong weekday and unsourced FedWatch percent are rejected', () => {
  const sources = [{
    name: 'CNBC',
    url: 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html',
    excerpt: 'Spot gold steadied near $4,087. CME FedWatch showed a 60.3% chance of a December hike.',
  }];
  const fedwatch = { stated: true, items: [{ sentence: 'CME FedWatch showed a 60.3% chance of a December hike.' }] };
  const wrongDay = gate({
    task: 'macro',
    clock: tuesday,
    sources,
    fedwatch,
    prices: [],
    text: JSON.stringify({
      items: [{ title: 'Hôm nay thứ Hai vàng giữ 4.087', summary: 'Gold near $4,087.', reason: 'Yields eased.', title_en: 'Gold', summary_en: 'Gold near $4,087.', reason_en: 'Yields.' }],
      fedwatch_note: 'FedWatch 60.3%.',
    }),
  });
  assert.equal(wrongDay.ok, false);
  const invented = gate({
    task: 'macro',
    clock: tuesday,
    sources,
    fedwatch,
    prices: [],
    text: JSON.stringify({
      items: [{ title: 'Vàng giữ 4.087', summary: 'FedWatch 80% cửa tăng.', reason: 'Gold near $4,087.', title_en: 'Gold', summary_en: 'FedWatch 80%.', reason_en: 'Gold near $4,087.' }],
      fedwatch_note: 'FedWatch 80%.',
    }),
  });
  assert.equal(invented.ok, false);
  assert.equal(contradictsClock('Hôm nay thứ Ba, vàng giữ giá.', tuesday), false);
  assert.equal(contradictsClock('Tuần mới vàng giữ 4.087.', tuesday), true);
});

test('time_en year is replaced with the computed year', () => {
  const sources = [{
    name: 'CNBC',
    url: 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html',
    excerpt: 'Spot gold steadied near $4,087.',
  }];
  const result = gate({
    task: 'macro',
    clock: tuesday,
    sources,
    fedwatch: { stated: false, items: [] },
    prices: [],
    text: JSON.stringify({
      items: [{
        title: 'Vàng giữ 4.087',
        summary: 'Spot gold steadied near $4,087.',
        reason: 'Lợi suất dịu.',
        title_en: 'Gold holds',
        summary_en: 'Spot gold steadied near $4,087.',
        reason_en: 'Yields eased.',
        time_en: 'Monday, November 9, 2025, 18:37 EST',
      }],
      fedwatch_note: 'Chưa có xác suất FedWatch trong nguồn.',
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.board.items[0].time_en, tuesday.timeEn);
  assert.equal(result.board.items[0].date, '2026-11-10');
  const numbers = extractNumbers('$4,087 and 4.087');
  assert.equal(numbers.ints.has('4087'), true);
});

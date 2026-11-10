'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { dateWindow, fedwatchSentences, htmlToText, isArticleUrl, isHomepageUrl, payrollFact, preferNewest, pricePathFromFacts, renderPriceLines } = require('../src/collect');
const { contradictsClock, extractNumbers, gate, lockDomesticBoard } = require('../src/quality');
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
  assert.match(path, /3900 → 4145/);
  assert.equal(path.includes('4600'), false);
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

test('FedWatch percent, newest print, payroll month, and nav are handled', () => {
  const hits = fedwatchSentences('The Kitco PM report says CME FedWatch shows an 82.2% probability of a 25bp December hike.');
  assert.equal(hits.length, 1);
  const kept = preferNewest([
    { sentence: 'Brent settled at $98.29.', published: '2026-11-10T12:00:00Z' },
    { sentence: 'Brent later settled at $92.57, down 5.85%.', published: '2026-11-10T20:00:00Z' },
  ]);
  assert.equal(kept.filter((fact) => /brent/i.test(fact.sentence)).length, 1);
  assert.match(kept[0].sentence, /92\.57/);
  const payroll = payrollFact('October payrolls rose by 165,000.');
  assert.equal(payroll.month, 10);
  assert.match(payroll.vn, /tháng 10/);
  assert.equal(/tháng 11/.test(payroll.vn), false);
  const cleaned = htmlToText('<p>presidents, since 1971 Cryptos Base Metals About Kitco Forum gold $4,100.</p>');
  assert.equal(/since 1971|About Kitco/i.test(cleaned), false);
});

test('a string analysis stays a sentence and a moved price is not called flat', () => {
  const board = {
    analysis: 'Nhẫn trơn 24K giữ lời bình đủ dài để không bị cắt thành từng chữ cái khi mã nguồn ghép bảng giá.',
    analysis_en: 'D',
    advice: 'Đi ngang và ổn định dù giá đã đổi, câu này đủ dài để bị loại vì nói giá đứng yên.',
    quick_advice: 'D',
  };
  const lines = ['PNJ Vàng miếng SJC: mua 137.900.000, bán 140.900.000 đồng/lượng. Nguồn: https://example.test/sjc'];
  lockDomesticBoard(board, lines, {
    prices: [
      { brand: 'PNJ', type: 'Vàng miếng SJC', buy: 137900000, sell: 140900000 },
      { brand: 'PNJ', type: 'Nhẫn trơn 24K', buy: 136000000, sell: 139000000 },
    ],
    previous: { bar: { buy: 138500000, sell: 141500000 }, ring: { buy: 136600000, sell: 139600000 } },
    sourceTime: '2026-11-10 08:40',
    clock: tuesday,
  });
  assert.equal(board.analysis.some((line) => line.length === 1), false);
  assert.match(board.quick_advice, /giảm 600\.000/);
  assert.match(board.quick_advice, /138\.500\.000/);
  assert.match(board.quick_advice, /140\.900\.000/);
  assert.match(board.quick_advice, /nhẫn trơn 24K/i);
  assert.equal(/đi ngang|ổn định/i.test(board.advice), false);
  assert.equal(board.as_of, '2026-11-10 08:40');
  assert.notEqual(board.quick_advice_en, 'D');
});

test('an extracted FedWatch percent replaces a no-figure note', () => {
  const result = gate({
    task: 'macro',
    final: true,
    clock: tuesday,
    facts: [],
    priceLines: [],
    prices: [],
    previous: null,
    sources: [{
      name: 'Kitco PM',
      url: 'https://www.kitco.com/news/article/2026-11-09/pm-report',
      excerpt: 'CME FedWatch shows an 82.2% probability of a 25bp December hike.',
    }],
    fedwatch: {
      stated: true,
      items: [{
        name: 'Kitco PM',
        url: 'https://www.kitco.com/news/article/2026-11-09/pm-report',
        published: '2026-11-09T18:00:00-05:00',
        sentence: 'CME FedWatch shows an 82.2% probability of a 25bp December hike.',
      }],
    },
    text: JSON.stringify({
      items: [{
        title: 'Vàng và FedWatch',
        summary: 'Chưa có số FedWatch cụ thể trong nguồn.',
        reason: 'Lợi suất là lực chính trong phiên.',
        title_en: 'Gold and FedWatch',
        summary_en: 'No FedWatch figure in the source.',
        reason_en: 'Yields led the session.',
      }],
      fedwatch_note: 'Chưa có số FedWatch cụ thể trong nguồn.',
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.match(result.board.fedwatch_note, /82\.2%/);
  assert.equal(/chưa có số fedwatch/i.test(result.board.fedwatch_note), false);
  assert.match(result.board.share_fb, /tin-vi-mo-anh-huong-gia-vang\.html/);
  assert.match(result.board.share_fb, /Làm theo kế hoạch, đừng chạy theo nến tin\./);
});

test('a domestic source time far from the request is rejected', () => {
  const result = gate({
    task: 'domestic',
    final: true,
    clock: tuesday,
    sourceTime: '2026-11-09 08:00',
    previous: null,
    prices: [{ brand: 'PNJ', type: 'Vàng miếng SJC', buy: 137900000, sell: 140900000 }],
    priceLines: ['PNJ Vàng miếng SJC: mua 137.900.000, bán 140.900.000 đồng/lượng. Nguồn: https://example.test/sjc'],
    sources: [{ name: 'PNJ', url: 'https://example.test/sjc', excerpt: 'mua 137.900.000 bán 140.900.000' }],
    fedwatch: { stated: false, items: [] },
    facts: [],
    text: JSON.stringify({ analysis: ['Lời bình đủ dài để không bị coi là một chữ cái khi ghép bảng giá trong nước sáng nay.'] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /lệch/);
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

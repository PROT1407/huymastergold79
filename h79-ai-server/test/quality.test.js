'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { dateWindow, fedwatchSentences, htmlToText, isArticleUrl, isHomepageUrl, payrollFact, preferNewest, pricePathFromFacts, renderPriceLines } = require('../src/collect');
const { contradictsClock, dedupeSentences, extractNumbers, failedNumbers, gate, learnNumberRoles, lintBoard, lockDomesticBoard, missingCore, movesMatchProducts, polishVn, repeatedWord, stripUnsourcedHedge, styleVnFields } = require('../src/quality');
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
  assert.match(path, /3\.900/);
  assert.match(path, /4\.145/);
  assert.equal(path.includes('→'), false);
  assert.equal(path.includes('4.600'), false);
  assert.equal(path.includes('4.032'), false);
  const crowded = pricePathFromFacts([
    { sentence: 'Gold election bounce ran from about $3,900 to a high near $4,145.' },
    { sentence: 'Price tested $4,000 support and a forced break took the low to $3,970.' },
    { sentence: 'Analysts see support at $4,032, resistance at $4,016 and targets at $4,064 and $4,089.' },
    { sentence: 'Gold could reach $4,700 if the April forecast holds, with another target at $4,300.' },
    { sentence: 'The World Bank gold path is $4,600 in 2026, then $4,250 in 2027, and $4,000 in 2028.' },
  ]);
  assert.match(crowded, /3\.900/);
  assert.match(crowded, /4\.145/);
  assert.equal(/4\.032|4\.016|4\.064|4\.089|4\.700|4\.600/.test(crowded), false);
  assert.equal((crowded.match(/giao dịch trong tuần đi từ/gi) || []).length, 0);
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

test('Kitco December probability stays 82.2 percent after normalization', () => {
  const sentence = 'approximately an 82.2\u00a0% probability of a 25-basis-point rate increase in December';
  assert.equal(fedwatchSentences(sentence).length, 1);
  const allowed = extractNumbers(sentence);
  const draft = extractNumbers('FedWatch 82.2% for December.');
  assert.deepEqual(failedNumbers(draft, allowed), []);
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
      url: 'https://www.kitco.com/news/article/2026-11-09/gold-silver-advance-dollar-weakens-fed-rate-expectations-face-inflation',
      normalized: sentence,
      excerpt: '',
    }],
    fedwatch: { stated: true, items: [{ name: 'Kitco PM', url: 'https://www.kitco.com/news/article/2026-11-09/gold-silver-advance-dollar-weakens-fed-rate-expectations-face-inflation', published: '2026-11-09T21:00:00Z', sentence }] },
    text: JSON.stringify({
      items: [{ title: 'FedWatch tháng 12', summary: 'Xác suất tăng tháng 12 là 82.2%.', reason: 'Kỳ vọng lãi suất chi phối vàng.', title_en: 'December FedWatch', summary_en: 'December probability is 82.2%.', reason_en: 'Rate expectations led gold.' }],
      fedwatch_note: '82.2%',
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.match(result.board.fedwatch_note, /82[,.]2%/);
  assert.equal(/https?:\/\//.test(result.board.fedwatch_note), false);
  assert.equal(/\d{4}-\d{2}-\d{2}T/.test(result.board.fedwatch_note), false);
});

test('the 08:56 snapshot beats the Nov 6 history row', () => {
  const data = {
    updated_vn: '08:56 10/11/2026',
    price_time: '08:55 10/11/2026',
    rows: [
      { code: 'SJL1L10', buy: 138500000, sell: 141500000 },
      { code: 'PQHN24NTT', buy: 136400000, sell: 140600000 },
      { code: 'SJ9999', buy: 137200000, sell: 141200000 },
    ],
    history: {
      SJL1L10: [{ date: '2026-11-06', buy: 138000000, sell: 141000000 }],
      SJ9999: [{ date: '2026-11-06', buy: 136500000, sell: 140500000 }],
    },
  };
  const { quotesBefore } = require('../src/quality');
  const previous = quotesBefore(data, '2026-11-10 12:32');
  assert.equal(previous.bar.buy, 138500000);
  assert.equal(previous.bar.sell, 141500000);
  assert.equal(previous.ring.buy, 136400000);
  assert.equal(previous.pnjRing.buy, 136400000);
  assert.equal(previous.sjcRing.buy, 137200000);
  assert.equal(previous.sjcRing.sell, 141200000);
  assert.equal(previous.ring.sell, 140600000);
  const morning = quotesBefore(data, '2026-11-10 08:43');
  assert.equal(morning.bar.buy, 138000000);
  const board = {};
  lockDomesticBoard(board, [], {
    prices: [
      { brand: 'SJC', type: 'Vàng miếng SJC', buy: 137900000, sell: 140900000 },
      { brand: 'PNJ', type: 'Nhẫn trơn 24K', buy: 136100000, sell: 140300000 },
    ],
    previous,
    sourceTime: '2026-11-10 12:32',
    clock: clockFromVnString('2026-11-10 12:32'),
  });
  assert.match(board.quick_advice, /600\.000/);
  assert.match(board.quick_advice, /300\.000/);
  assert.equal(board.share_lead.split('\n').length, 2);
  assert.equal(board.share_lead.includes(board.analysis[0]), false);
});

test('weekly core ignores optional World Bank percentages', () => {
  const facts = [
    { kind: 'payroll', value: 165000, month: 10, sentence: 'October payrolls rose by 165,000.', vn: 'Báo cáo việc làm tháng 10 tăng 165.000 người.' },
    { kind: 'forecast', sentence: 'World Bank gold path with side notes of 11% and 6.5% and 40% and 8.3% and 6% and 5%.', vn: 'Dự báo World Bank: 4.600, 4.250, 4.000 USD/oz, không phải giá đã giao dịch trong tuần.' },
    { kind: 'market', sentence: 'Spot bounced from $3,970, up 11%.' },
  ];
  const path = 'Trong tuần, giá vàng đi từ khoảng 3.970 lên đỉnh 4.145.';
  const blob = `${path} Mốc 4000 nằm trong dự báo 4600, 4250 và 4000. Báo cáo việc làm tháng 10 tăng 165.000.`;
  assert.deepEqual(missingCore(blob, facts, path), []);
  const result = gate({
    task: 'weekly',
    final: true,
    clock: clockFromVnString('2026-11-08 09:00'),
    facts,
    pricePath: path,
    priceLines: [],
    prices: [],
    previous: null,
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-08/week-review',
      normalized: 'Gold traded 3970 to 4145 in 2025, 2026, 2027 and 2028. October payrolls rose by 165,000. World Bank sees 4,600 then 4,250 then 4,000, with side rates of 11%, 6.5%, 40%, 8.3%, 6% and 5% discussed in 2023.',
    }],
    fedwatch: { stated: false, items: [] },
    text: JSON.stringify({
      title: 'Tuần vàng 2–6/11',
      title_en: 'Gold week',
      sections: [{ h: 'Tuần', p: 'Trong tuần, giá vàng giao dịch đi qua các mốc 3970 tới 4145 USD/oz. Mốc 4000 nằm trong dự báo 4600, 4250 và 4000. Báo cáo việc làm tháng 10 tăng 165.000 người.' }],
      sections_en: [{ h: 'Week', p: 'Gold traded from 3970 to 4145. October payrolls rose by 165,000. The World Bank path is 4600, 4250 and 4000.' }],
      share_fb: 'draft',
      share_zalo: 'draft',
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.equal((result.debug && result.debug.missingFacts || []).some((token) => /^20\d\d$/.test(token)), false);
});

test('shares put the Zalo line only on Zalo and drop prompt leaks', () => {
  const board = {
    analysis: ['Giữ khung, chỉ đổi số. Lời bình đủ dài để còn lại sau khi bỏ câu hướng dẫn khỏi phần giá trong nước.'],
    advice: 'tránhua khi giá chạy, câu này đủ dài để kiểm tra chữ dính và nhẫn tròn trơn trong lời bình.',
    quick_advice: 'x',
  };
  lockDomesticBoard(board, ['PNJ dòng giá đủ dài để không bị coi là cụt: mua 137.900.000, bán 140.900.000 đồng/lượng.'], {
    prices: [{ brand: 'SJC', type: 'Vàng miếng SJC', buy: 137900000, sell: 140900000 }],
    previous: null,
    sourceTime: '2026-11-10 12:20',
    clock: tuesday,
  });
  assert.match(board.analysis[0], /Cập nhật 12:20/);
  assert.equal(/Giá nguồn lúc/.test(board.analysis.join(' ')), false);
  assert.equal(/tránhua|Giữ khung/i.test(JSON.stringify(board.analysis.concat(board.advice))), false);
  assert.match(board.advice, /tránh mua/);
  assert.ok(board.analysis_en[0].length >= 40);
  const result = gate({
    task: 'domestic',
    final: true,
    clock: tuesday,
    sourceTime: '2026-11-10 12:20',
    previous: null,
    prices: [{ brand: 'SJC', type: 'Vàng miếng SJC', buy: 137900000, sell: 140900000 }],
    priceLines: ['SJC Vàng miếng SJC: mua 137.900.000, bán 140.900.000 đồng/lượng. Nguồn: https://example.test/sjc'],
    sources: [{ name: 'SJC', url: 'https://example.test/sjc', normalized: 'mua 137.900.000 bán 140.900.000' }],
    fedwatch: { stated: false, items: [] },
    facts: [],
    text: JSON.stringify({ analysis: ['Giữ khung, chỉ đổi số. Lời bình đủ dài để còn lại sau khi bỏ câu hướng dẫn khỏi phần giá trong nước.'], advice: 'tránhua khi giá chạy, câu này đủ dài để kiểm tra chữ dính trong lời bình hôm nay.' }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.match(result.board.share_zalo, /https:\/\/h79gold\.com\/zalo/);
  assert.equal(result.board.share_fb.includes('h79gold.com/zalo'), false);
  assert.match(result.board.share_fb, /gia-vang\.html/);
  assert.equal(/Giá nguồn lúc/.test(result.board.share_fb), false);
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
  assert.match(result.board.fedwatch_note, /82[,.]2%/);
  assert.equal(/https?:\/\//.test(result.board.fedwatch_note), false);
  assert.equal(/\d{4}-\d{2}-\d{2}T/.test(result.board.fedwatch_note), false);
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

test('11/11 domestic changes stay on the same product and a 2 million drop is not called quiet', () => {
  const prices = [
    { brand: 'SJC', type: 'Vàng miếng SJC', buy: 136500000, sell: 139500000 },
    { brand: 'SJC', type: 'Nhẫn SJC', buy: 135300000, sell: 139300000 },
    { brand: 'PNJ', type: 'Nhẫn trơn 24K', buy: 134700000, sell: 138900000 },
  ];
  const previous = {
    bar: { buy: 138500000, sell: 141500000 },
    sjcRing: { buy: 137200000, sell: 141200000 },
    pnjRing: { buy: 136400000, sell: 140600000 },
    ring: { buy: 137200000, sell: 141200000 },
  };
  const crossed = 'Nhẫn trơn 24K giảm 2.500.000 đồng chiều mua, giảm 2.300.000 đồng chiều bán.';
  assert.equal(movesMatchProducts(crossed, prices, previous), false);
  const lines = prices.map((row) => `${row.brand} ${row.type}: mua ${row.buy}, bán ${row.sell}. Nguồn: https://example.test/gold`);
  const result = gate({
    task: 'domestic',
    final: true,
    clock: clockFromVnString('2026-11-11 08:55'),
    sourceTime: '2026-11-11 08:55',
    previous,
    prices,
    priceLines: lines,
    sources: [{ name: 'SJC', url: 'https://example.test/gold', excerpt: lines.join(' ') }],
    fedwatch: { stated: false, items: [] },
    facts: [],
    text: JSON.stringify({
      analysis: ['Sáng nay không ghi nhận biến động mạnh, câu này đủ dài để lẽ ra lọt vào bản tin nếu bộ lọc không bỏ câu phủ nhận đà giảm.'],
      advice: 'Thị trường đi ngang và ổn định dù bảng giá đã đổi hai triệu mỗi chiều, câu này đủ dài.',
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  const text = `${result.board.quick_advice}\n${result.board.share_lead}`;
  assert.match(text, /SJC miếng giảm 2\.000\.000/);
  assert.match(text, /Nhẫn SJC giảm 1\.900\.000/);
  assert.match(text, /Nhẫn trơn 24K giảm 1\.700\.000/);
  assert.equal(/2\.500\.000|2\.300\.000/.test(text), false);
  assert.equal(/không ghi nhận biến động|đi ngang|ổn định/i.test(result.board.analysis.join(' ')), false);
  assert.equal(result.board.share_lead.split('\n').length, 3);
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

test('Vietnamese numbers, spacing, dropped words, and English parentheses are normalized', () => {
  const corpus = 'Silver at $53.320 and oil at $69.40. Index 101.88. Yields 5.75 and 92.57. Brent 3.98. Copper 86.85. A quote of $1.350. Payrolls rose by 165,000. Gold $4,140.40.';
  const roles = learnNumberRoles(corpus);
  const text = polishVn('Giá mức53.320, dầu 69.40, chỉ số 101.88, lợi suất 5.75 và 92.57, Brent 3.98, đồng 86.85, đơn giá 1.350, việc làm 165.000, vàng 4.140,40. (spot gold) (nonfarm payrolls) (Fed) (dollar index). kỳ hạn 2 nhạy cảm và kỳ hạn 10. Q3 FY2026 https://h79gold.com/zalo', roles);
  assert.match(text, /mức 53,32/);
  assert.match(text, /69,40/);
  assert.match(text, /101,88/);
  assert.match(text, /5,75/);
  assert.match(text, /92,57/);
  assert.match(text, /3,98/);
  assert.match(text, /86,85/);
  assert.match(text, /1,35/);
  assert.match(text, /165\.000/);
  assert.match(text, /4\.140,40/);
  assert.match(text, /vàng giao ngay/);
  assert.match(text, /NFP/);
  assert.match(text, /\(Fed\)/);
  assert.match(text, /kỳ hạn 2 năm nhạy cảm/);
  assert.match(text, /kỳ hạn 10 năm/);
  assert.match(text, /Q3/);
  assert.match(text, /FY2026/);
  assert.match(text, /https:\/\/h79gold\.com\/zalo/);
  assert.equal(text.includes('(spot gold)'), false);
  assert.equal(text.includes('(dollar index)'), false);
  assert.equal(text.includes('53.320'), false);
  const gated = gate({
    task: 'macro',
    clock: tuesday,
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-09/silver-oil',
      excerpt: corpus,
    }],
    fedwatch: { stated: false, items: [] },
    prices: [],
    text: JSON.stringify({
      items: [{
        title: 'Bạc mức53.320',
        summary: 'Bạc giao dịch 53.320 USD và dầu 69.40 USD (spot gold). kỳ hạn 2 nhạy cảm với CPI.',
        reason: 'Dầu 69.40 vẫn là lực kéo chi phí trong phiên này.',
        title_en: 'Silver',
        summary_en: 'Silver traded at $53.320. Oil was $69.40.',
        reason_en: 'Oil was $69.40 and silver at $53.320.',
      }],
      fedwatch_note: 'Chưa có xác suất FedWatch trong nguồn.',
    }),
  });
  assert.equal(gated.ok, true, JSON.stringify(gated.debug || gated.error));
  assert.match(gated.board.items[0].summary, /53,32/);
  assert.match(gated.board.items[0].summary, /69,40/);
  assert.match(gated.board.items[0].title, /mức 53,32/);
  assert.match(gated.board.items[0].summary, /kỳ hạn 2 năm/);
  assert.match(gated.board.items[0].summary, /vàng giao ngay/);
});

test('a rounded title percent is replaced and a distant one is rejected', () => {
  const source = {
    name: 'Kitco',
    url: 'https://www.kitco.com/news/article/2026-11-09/fedwatch',
    excerpt: 'CME FedWatch showed an 82.2% probability of a December hike. A separate print was 70%.',
  };
  const aligned = gate({
    task: 'macro',
    clock: tuesday,
    sources: [source],
    fedwatch: { stated: true, items: [{ url: source.url, sentence: 'CME FedWatch showed an 82.2% probability of a December hike.', published: '2026-11-09T17:03:15-05:00' }] },
    prices: [],
    text: JSON.stringify({
      items: [{
        title: 'FedWatch quanh mức 80%',
        summary: 'Xác suất tháng 12 nằm trong bài.',
        reason: 'Lợi suất dịu khi cửa tăng được định giá lại trong bài này.',
        title_en: 'FedWatch',
        summary_en: 'CME FedWatch showed an 82.2% probability of a December hike.',
        reason_en: 'Yields eased.',
      }],
    }),
  });
  assert.equal(aligned.ok, true, JSON.stringify(aligned.debug || aligned.error));
  assert.match(aligned.board.items[0].title, /82,2%/);
  assert.equal(aligned.board.items[0].title.includes('80%'), false);
  const distant = gate({
    task: 'macro',
    clock: tuesday,
    sources: [source],
    fedwatch: { stated: true, items: [{ url: source.url, sentence: 'CME FedWatch showed an 82.2% probability of a December hike.', published: '2026-11-09T17:03:15-05:00' }] },
    prices: [],
    text: JSON.stringify({
      items: [{
        title: 'Vàng quanh mức 70%',
        summary: 'Xác suất tháng 12 nằm trong bài và chưa được làm tròn.',
        reason: 'Lợi suất dịu khi cửa tăng được định giá lại trong bài này.',
        title_en: 'Gold holds',
        summary_en: 'CME FedWatch showed an 82.2% probability of a December hike.',
        reason_en: 'Yields eased.',
      }],
    }),
  });
  assert.equal(distant.ok, false);
  assert.match(distant.debug.detail, /title percent 70%/);
});

test('weekly drops an unsupported Iran claim and names the week', () => {
  const result = gate({
    task: 'weekly',
    final: true,
    clock: clockFromVnString('2026-11-08 09:00'),
    week: { start: '2026-11-02', end: '2026-11-06' },
    facts: [
      { kind: 'payroll', value: 165000, month: 10, sentence: 'October payrolls rose by 165,000.', vn: 'Báo cáo việc làm tháng 10 tăng 165.000 người.' },
      { kind: 'forecast', sentence: 'The World Bank Commodity Markets Outlook puts gold at $4,600 then $4,250 then $4,000.', vn: 'Dự báo World Bank trong Commodity Markets Outlook: 4.600, 4.250, 4.000 USD/oz.' },
    ],
    pricePath: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145.',
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-08/week-review',
      normalized: 'Gold bounced from $3,900 to $4,145. October payrolls rose by 165,000. The World Bank Commodity Markets Outlook puts gold at $4,600 then $4,250 then $4,000. US debt is above $40 trillion and the dollar eased.',
    }],
    fedwatch: { stated: false, items: [] },
    text: JSON.stringify({
      title: 'Mốc 4.000',
      title_en: 'Gold week',
      sections: [{
        h: 'Tuần',
        p: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145. Mốc 4.000 được thử. Việc làm tháng 10 tăng 165.000 người. Dự báo World Bank trong Commodity Markets Outlook: 4.600, 4.250, 4.000. Nợ công Mỹ đã trên 40 nghìn tỷ USD, khả năng đàm phán với Iran tiếp tục giữ vai trò hỗ trợ dài hạn cho kim loại quý. Nhà đầu tư châu Âu chờ tín hiệu mới.',
      }],
      sections_en: [{ h: 'Week', p: 'Gold traded from 3900 to 4145. October payrolls rose by 165,000. World Bank outlook 4600, 4250 and 4000.' }],
    }),
  });
  const prose = `${result.board.title}\n${result.board.sections.map((section) => section.p).join(' ')}`;
  assert.match(prose, /tuần 2\/11–6\/11/);
  assert.match(prose, /Ngân hàng Thế giới/);
  assert.match(prose, /Triển vọng Thị trường Hàng hóa/);
  assert.match(prose, /Nợ công Mỹ đã trên 40 nghìn tỷ USD/);
  assert.equal(/iran/i.test(prose), false);
  assert.equal(/World Bank|Commodity Markets Outlook/.test(prose), false);
  assert.match(prose, /châu Âu/);
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
});

test('weekly boilerplate is split, dropped, or sent back for one rewrite', () => {
  const result = gate({
    task: 'weekly',
    final: true,
    clock: clockFromVnString('2026-11-08 09:00'),
    facts: [
      { kind: 'payroll', value: 165000, month: 10, sentence: 'October payrolls rose by 165,000.', vn: 'Báo cáo việc làm tháng 10 tăng 165.000 người.' },
      { kind: 'forecast', sentence: 'The World Bank gold path is $4,600 then $4,250 then $4,000.', vn: 'Dự báo World Bank: 4.600, 4.250, 4.000 USD/oz.' },
    ],
    pricePath: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145.',
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-08/week-review',
      normalized: 'Gold bounced from $3,900 to $4,145. October payrolls rose by 165,000. The World Bank gold path is $4,600 then $4,250 then $4,000.',
    }],
    fedwatch: { stated: false, items: [] },
    text: JSON.stringify({
      title: 'Mốc 4.000',
      title_en: 'Gold week',
      sections: [{
        h: 'Tuần',
        p: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145. Mốc 4.000 được thử. Việc làm tháng 10 tăng 165.000 người. Dự báo World Bank: 4.600, 4.250, 4.000. Giá giữ 4.000, tạo bệ đỡ vững chắc về dài hạn cho vàng, vượt qua mốc nợ công đã vượt 40 nghìn tỷ USD. Ngân hàng Thế giới vẫn lạc quan. Tuần giao dịch đầy sóng gió. Vượt đỉnh rồi đã vượt tiếp.',
      }],
      sections_en: [{ h: 'Week', p: 'Gold traded from 3900 to 4145. October payrolls rose by 165,000.' }],
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.debug.phraseRewrite, true);
  const prose = result.board.sections.map((section) => section.p).join(' ');
  assert.match(prose, /Nợ công Mỹ đã trên 40 nghìn tỷ USD/);
  assert.equal(prose.includes('bệ đỡ vững chắc'), false);
  assert.equal(prose.includes('Ngân hàng Thế giới vẫn lạc quan'), false);
  assert.equal(result.debug.flagged.some((sentence) => sentence.includes('giao dịch đầy sóng gió')), true);
  assert.equal(result.debug.flagged.some((sentence) => /vượt/i.test(sentence)), true);
});

test('sourced weekly sentences with hàng and công pass the linter', () => {
  const result = gate({
    task: 'weekly',
    final: true,
    clock: clockFromVnString('2026-11-08 09:00'),
    week: { start: '2026-11-02', end: '2026-11-06' },
    facts: [
      { kind: 'payroll', value: 165000, month: 10, sentence: 'October payrolls rose by 165,000.', vn: 'Báo cáo việc làm tháng 10 tăng 165.000 người.' },
      { kind: 'forecast', sentence: 'The World Bank Commodity Markets Outlook puts gold at $4,600 then $4,250 then $4,000.', vn: 'Dự báo Ngân hàng Thế giới: 4.600, 4.250, 4.000 USD/oz.' },
      { kind: 'market', sentence: 'Democrats gained the advantage in Congress after the US midterm election. The market said Federal Reserve monetary policy is what sets the direction for gold.' },
    ],
    pricePath: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145.',
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-08/week-review',
      normalized: 'Gold bounced from $3,900 to $4,145. October payrolls rose by 165,000. Democrats gained the advantage in Congress after the US midterm election. The market said Federal Reserve monetary policy is what sets the direction for gold. The World Bank Commodity Markets Outlook puts gold at $4,600 then $4,250 then $4,000. US debt is above $40 trillion.',
    }],
    fedwatch: { stated: false, items: [] },
    text: JSON.stringify({
      title: 'Mốc 4.000',
      title_en: 'Gold week',
      sections: [{
        h: 'Tuần',
        p: 'Kết quả bầu cử giữa kỳ tại Mỹ mang lại ưu thế cho Đảng Dân chủ tại Quốc hội. Tuy nhiên, thị trường nhận định chính sách tiền tệ của Cục Dự trữ Liên bang Mỹ mới là yếu tố quyết định hướng đi của kim loại quý. Trong bản Triển vọng Thị trường Hàng hóa tháng 10, Ngân hàng Thế giới dự báo giá vàng đạt trung bình 4.600 USD/oz, rồi 4.250 và 4.000. Nợ công Mỹ đã trên 40 nghìn tỷ USD. Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145. Mốc 4.000 được thử. Việc làm tháng 10 tăng 165.000 người.',
      }],
      sections_en: [{ h: 'Week', p: 'Gold traded from 3900 to 4145. October payrolls rose by 165,000. Democrats led Congress. World Bank outlook 4600, 4250 and 4000.' }],
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  const prose = result.board.sections.map((section) => section.p).join(' ');
  assert.match(prose, /Đảng Dân chủ tại Quốc hội/);
  assert.match(prose, /Cục Dự trữ Liên bang Mỹ/);
  assert.match(prose, /Triển vọng Thị trường Hàng hóa tháng 10/);
  assert.match(prose, /4\.600/);
  assert.match(prose, /Nợ công Mỹ đã trên 40 nghìn tỷ USD/);
});

test('FedWatch item titles keep 82,2 percent and basis points', () => {
  const source = {
    name: 'Kitco',
    url: 'https://www.kitco.com/news/article/2026-11-09/fedwatch',
    excerpt: 'CME FedWatch showed an 82.2% probability of a 25 basis point December hike.',
  };
  const result = gate({
    task: 'macro',
    clock: tuesday,
    sources: [source],
    fedwatch: { stated: true, items: [{ url: source.url, sentence: source.excerpt, published: '2026-11-09T17:03:15-05:00' }] },
    prices: [],
    text: JSON.stringify({
      items: [
        {
          title: 'Vàng trong phiên',
          summary: 'Vàng giữ nhịp khi lợi suất dịu trong phiên Mỹ.',
          reason: 'Dòng tiền trú ẩn còn mỏng và cần thêm dữ liệu giá.',
          title_en: 'Gold',
          summary_en: 'Gold steadied.',
          reason_en: 'Yields eased.',
        },
        {
          title: 'Cửa tăng tháng 12',
          summary: 'FedWatch nghiêng một lần tăng 25 điểm chuẩn trong tháng 12.',
          reason: 'Xác suất này là mốc thị trường đang định giá cho cuộc họp.',
          title_en: 'December odds',
          summary_en: 'CME FedWatch showed an 82.2% probability of a 25 basis point December hike.',
          reason_en: 'The market is priced for that move.',
        },
      ],
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.match(result.board.items[1].title, /82,2%/);
  assert.match(result.board.items[1].summary, /25 điểm cơ bản/);
  assert.equal(result.board.items[1].summary.includes('điểm chuẩn'), false);
  assert.equal(result.board.items[0].title.includes('%'), false);
});

test('a gold opener does not stutter giao ngay with spot', () => {
  const raw = 'Giá vàng giao ngay spot vàng giao dịch quanh mức 4.140,40 USD/ounce trong phiên Mỹ.';
  const cleaned = polishVn(raw, learnNumberRoles('Spot gold traded near $4,140.40.'));
  assert.match(cleaned, /Giá vàng giao ngay quanh mức 4\.140,40 USD\/ounce/);
  assert.equal(/giao ngay\s+spot|spot\s+vàng\s+giao dịch|gold\s+spot\s+vàng|vàng\s+vàng/i.test(cleaned), false);
  assert.equal(/giao ngay\s+spot/i.test(polishVn('Vàng giao ngay spot quanh 4.140,40.')), false);
  assert.equal(/gold\s+spot\s+vàng/i.test(polishVn('Giá gold spot vàng quanh mức 4.140,40.')), false);
  const source = {
    name: 'CNBC',
    url: 'https://www.cnbc.com/2026/11/10/gold-spot-4140.html',
    excerpt: 'Spot gold traded near $4,140.40 an ounce. CNBC quotes XAU=.',
  };
  const result = gate({
    task: 'macro',
    clock: tuesday,
    sources: [source],
    fedwatch: { stated: false, items: [] },
    prices: [],
    text: JSON.stringify({
      items: [{
        title: 'Vàng giao ngay',
        summary: raw,
        reason: 'Phiên Mỹ giữ vàng quanh mức đã khớp trong bài CNBC.',
        title_en: 'Spot gold',
        summary_en: 'Spot gold traded near $4,140.40 an ounce.',
        reason_en: 'The CNBC print matches that level.',
      }],
      fedwatch_note: 'Chưa có xác suất FedWatch trong nguồn.',
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.match(result.board.items[0].summary, /Giá vàng giao ngay quanh mức 4\.140,40/);
  assert.equal(/giao ngay\s+spot|spot\s+vàng\s+giao dịch/i.test(result.board.items[0].summary), false);
  assert.equal(/giao ngay\s+spot|spot\s+vàng\s+giao dịch/i.test(result.board.share_fb), false);
});

test('an unsourced Hormuz gold hedge is dropped and not replaced', () => {
  const hedge = 'Dài hạn: Sự bất ổn tại eo biển Hormuz vẫn tiềm ẩn rủi ro quay đầu nếu đàm phán ngoại giao thất bại, giữ vai trò phòng thủ dài hạn cho kim loại quý.';
  const oil = 'Brent crude fell as diplomatic hopes eased the risk of a strike near the Strait of Hormuz. Brent was $92.57 and spot gold was $4,140.40.';
  assert.equal(stripUnsourcedHedge(`Ngắn hạn: dầu Brent về 92,57. ${hedge}`, oil).includes('phòng thủ dài hạn'), false);
  assert.equal(/hormuz|đàm phán|eo biển/i.test(stripUnsourcedHedge(hedge, oil)), false);
  const sourced = 'Gold remains a long-term hedge if Hormuz talks fail.';
  assert.match(stripUnsourcedHedge(hedge, `${oil} ${sourced}`), /phòng thủ dài hạn/);
  const source = {
    name: 'CNBC',
    url: 'https://www.cnbc.com/2026/11/10/oil-hormuz.html',
    excerpt: oil,
  };
  const result = gate({
    task: 'macro',
    clock: tuesday,
    sources: [source],
    fedwatch: { stated: false, items: [] },
    prices: [],
    text: JSON.stringify({
      items: [{
        title: 'Dầu và vàng',
        summary: 'Dầu Brent quanh 92,57 USD và vàng quanh 4.140,40 sau khi hy vọng ngoại giao hạ rủi ro.',
        reason: `Ngắn hạn: dầu Brent về 92,57, vàng 4.140,40. ${hedge}`,
        title_en: 'Oil',
        summary_en: oil,
        reason_en: 'Brent fell as diplomatic hopes eased strike risk.',
      }],
      fedwatch_note: 'Chưa có xác suất FedWatch trong nguồn.',
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  const reason = result.board.items[0].reason;
  assert.match(reason, /92,57/);
  assert.equal(/phòng thủ dài hạn|Hormuz|đàm phán/i.test(reason), false);
});

test('near-duplicate debt sentences collapse to one', () => {
  const pair = 'Nợ công Mỹ đã vượt 40 nghìn tỷ USD. Nợ công Mỹ đã trên 40 nghìn tỷ USD.';
  const cleaned = dedupeSentences(pair);
  assert.equal((cleaned.match(/Nợ công/g) || []).length, 1);
  assert.match(cleaned, /đã trên 40 nghìn tỷ USD/);
  const result = gate({
    task: 'weekly',
    final: true,
    clock: clockFromVnString('2026-11-08 09:00'),
    week: { start: '2026-11-02', end: '2026-11-06' },
    facts: [
      { kind: 'payroll', value: 165000, month: 10, sentence: 'October payrolls rose by 165,000.', vn: 'Báo cáo việc làm tháng 10 tăng 165.000 người.' },
      { kind: 'forecast', sentence: 'The World Bank gold path is $4,600 then $4,250 then $4,000.', vn: 'Dự báo Ngân hàng Thế giới: 4.600, 4.250, 4.000 USD/oz.' },
    ],
    pricePath: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145.',
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-08/week-review',
      normalized: 'Gold bounced from $3,900 to $4,145. October payrolls rose by 165,000. The World Bank gold path is $4,600 then $4,250 then $4,000. US debt is above $40 trillion.',
    }],
    fedwatch: { stated: false, items: [] },
    text: JSON.stringify({
      title: 'Mốc 4.000',
      title_en: 'Gold week',
      sections: [{
        h: 'Tuần',
        p: `Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145. Mốc 4.000 được thử. Việc làm tháng 10 tăng 165.000 người. Dự báo Ngân hàng Thế giới: 4.600, 4.250, 4.000. ${pair}`,
      }],
      sections_en: [{ h: 'Week', p: 'US debt has exceeded 40 trillion USD. US debt is above 40 trillion USD. Gold traded from 3900 to 4145.' }],
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  const prose = result.board.sections.map((section) => section.p).join(' ');
  assert.equal((prose.match(/Nợ công/g) || []).length, 1);
  assert.match(prose, /4\.600/);
  const english = result.board.sections_en.map((section) => section.p).join(' ');
  assert.equal((english.match(/US debt/g) || []).length, 1);
});

test('bare Spot gold in a Vietnamese sentence becomes a Vietnamese opener', () => {
  const raw = 'Core CPI tăng 0,3%, cao hơn dự báo 0,2%. Spot gold giao dịch quanh mức 4.031,80 USD/ounce, giảm 107,60 USD (tương đương 2,60%).';
  const cleaned = polishVn(raw, learnNumberRoles('Core CPI rose 0.3%. Spot gold traded near $4,031.80, down $107.60.'));
  assert.match(cleaned, /Core CPI tăng 0,3%/);
  assert.match(cleaned, /Giá vàng giao ngay quanh mức 4\.031,80 USD\/ounce, giảm 107,60 USD/);
  assert.equal(/spot\s+gold|gold\s+spot/i.test(cleaned), false);
  assert.equal(/spot\s+gold|gold\s+spot/i.test(polishVn('Kim loại gold spot giữ nhịp.')), false);
  const stale = lintBoard('macro', {
    items: [{
      title: 'Vàng',
      summary: 'Spot gold giao dịch quanh mức 4.031,80.',
      reason: 'Lợi suất dịu đủ dài để câu nhận xét không bị cắt vì ngắn.',
    }],
    share_fb: 'Vàng\nhttps://h79gold.com/bai/x.html\nLàm theo kế hoạch, đừng chạy theo nến tin.',
    share_zalo: 'Vàng\nhttps://h79gold.com/bai/x.html\nLàm theo kế hoạch, đừng chạy theo nến tin.\n👥 Join nhóm Zalo H79 - Nhận tín hiệu free: https://h79gold.com/zalo',
  }, {});
  assert.equal(stale.some((problem) => problem === 'english spot gold left in Vietnamese'), true);
});

test('multiline share text keeps its line breaks', () => {
  const share = [
    'SJC miếng mua 145.200.000 / bán 147.800.000',
    'Nhẫn trơn 24K mua 140.000.000 / bán 144.000.000',
    'https://h79gold.com/gia-vang.html',
    'Làm theo kế hoạch, đừng chạy theo nến tin.',
  ].join('\n');
  const zalo = `${share}\n👥 Join nhóm Zalo H79 - Nhận tín hiệu free: https://h79gold.com/zalo`;
  assert.equal(polishVn(share).split('\n').length, 4);
  assert.match(polishVn(share), /SJC miếng[\s\S]*\nNhẫn trơn 24K/);
  const board = { share_fb: share, share_zalo: zalo, share_lead: share };
  styleVnFields(board, 'Spot gold traded near $4,140.40.');
  assert.equal(board.share_fb.split('\n').length, 4);
  assert.equal(board.share_lead.split('\n').length, 4);
  assert.equal(board.share_zalo.split('\n').length, 5);
  assert.match(board.share_fb, /^SJC miếng/);
  assert.match(board.share_zalo, /h79gold\.com\/zalo$/);
});

test('việc làm twice is not a repeated-word failure', () => {
  const line = 'Báo cáo việc làm tháng 10 tăng 165.000 người và việc làm khu vực tư vẫn tăng.';
  assert.equal(repeatedWord(line), '');
  assert.equal(repeatedWord('Giá vượt đỉnh rồi đã vượt tiếp.'), 'vượt');
  const result = gate({
    task: 'weekly',
    final: true,
    clock: clockFromVnString('2026-11-08 09:00'),
    week: { start: '2026-11-02', end: '2026-11-06' },
    facts: [
      { kind: 'payroll', value: 165000, month: 10, sentence: 'October payrolls rose by 165,000.', vn: 'Báo cáo việc làm tháng 10 tăng 165.000 người.' },
      { kind: 'forecast', sentence: 'The World Bank gold path is $4,600 then $4,250 then $4,000.', vn: 'Dự báo Ngân hàng Thế giới: 4.600, 4.250, 4.000 USD/oz.' },
    ],
    pricePath: 'Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145.',
    sources: [{
      name: 'Kitco',
      url: 'https://www.kitco.com/news/article/2026-11-08/week-review',
      normalized: 'Gold bounced from $3,900 to $4,145. October payrolls rose by 165,000. The World Bank gold path is $4,600 then $4,250 then $4,000.',
    }],
    fedwatch: { stated: false, items: [] },
    text: JSON.stringify({
      title: 'Mốc 4.000',
      title_en: 'Gold week',
      sections: [{
        h: 'Tuần',
        p: `Trong tuần, giá vàng đi từ khoảng 3.900 lên đỉnh 4.145. Mốc 4.000 được thử. ${line} Dự báo Ngân hàng Thế giới: 4.600, 4.250, 4.000.`,
      }],
      sections_en: [{ h: 'Week', p: 'Gold traded from 3900 to 4145. October payrolls rose by 165,000.' }],
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.debug || result.error));
  assert.equal(/repeated word: việc/.test((result.debug && result.debug.detail) || ''), false);
  assert.match(result.board.sections.map((section) => section.p).join(' '), /việc làm/);
});

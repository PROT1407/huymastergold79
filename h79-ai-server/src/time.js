'use strict';

const WEEKDAY_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function fromUtc(ms) {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    weekday: date.getUTCDay(),
  };
}

function clockFromVnString(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) return null;
  const vnMs = Date.UTC(year, month - 1, day, hour, minute);
  const vn = fromUtc(vnMs);
  if (vn.year !== year || vn.month !== month || vn.day !== day || vn.hour !== hour || vn.minute !== minute) return null;
  const et = fromUtc(vnMs - 12 * 60 * 60 * 1000);
  return {
    datetimeVn: `${isoDate(year, month, day)} ${pad(hour)}:${pad(minute)}`,
    dateVn: isoDate(year, month, day),
    timeVn: `${pad(hour)}:${pad(minute)}`,
    weekdayIndex: vn.weekday,
    weekdayVn: WEEKDAY_VN[vn.weekday],
    weekdayEn: WEEKDAY_EN[vn.weekday],
    year,
    dateEt: isoDate(et.year, et.month, et.day),
    timeEt: `${pad(et.hour)}:${pad(et.minute)}`,
    weekdayEtEn: WEEKDAY_EN[et.weekday],
    weekdayEtVn: WEEKDAY_VN[et.weekday],
    timeEn: `${WEEKDAY_EN[et.weekday]}, ${MONTHS_EN[et.month - 1]} ${et.day}, ${et.year}, ${pad(et.hour)}:${pad(et.minute)} EST`,
  };
}

function vietnamDateTime(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => {
    const part = parts.find((item) => item.type === type);
    return part ? part.value : '';
  };
  let hour = pick('hour');
  if (hour === '24') hour = '00';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${hour}:${pick('minute')}`;
}

function resolveClock(input, now) {
  if (input != null && String(input).trim() !== '') return clockFromVnString(input);
  return clockFromVnString(vietnamDateTime(now));
}

module.exports = {
  WEEKDAY_EN,
  WEEKDAY_VN,
  clockFromVnString,
  resolveClock,
  vietnamDateTime,
};

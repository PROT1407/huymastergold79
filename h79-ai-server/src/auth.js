'use strict';

const crypto = require('node:crypto');

function readBearer(header) {
  if (typeof header !== 'string') return '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function tokensMatch(provided, expected) {
  const exp = typeof expected === 'string' ? expected : '';
  const got = typeof provided === 'string' ? provided : '';
  const expOk = exp.length > 0 && exp.length <= 512;
  const gotOk = got.length > 0 && got.length <= 512;
  const a = crypto.createHash('sha256').update(gotOk ? got : ' ').digest();
  const b = crypto.createHash('sha256').update(expOk ? exp : ' ').digest();
  return expOk && gotOk && crypto.timingSafeEqual(a, b);
}

module.exports = { readBearer, tokensMatch };

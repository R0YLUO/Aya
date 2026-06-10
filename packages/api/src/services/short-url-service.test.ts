import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARE_CODE_LENGTH,
  ShortUrlService,
  generateShareCode,
} from './short-url-service.js';

const URL_SAFE_BASE62 = /^[0-9A-Za-z]{8}$/;

test('generateShareCode returns an 8-char URL-safe base62 code', () => {
  for (let i = 0; i < 100; i++) {
    const code = generateShareCode();
    assert.equal(code.length, SHARE_CODE_LENGTH);
    assert.match(code, URL_SAFE_BASE62);
  }
});

test('codes are unique across many generations', () => {
  const seen = new Set<string>();
  const n = 10_000;
  for (let i = 0; i < n; i++) {
    seen.add(generateShareCode());
  }
  // With 62^8 (~2.18e14) space, 10k draws collide with negligible probability.
  assert.equal(seen.size, n);
});

test('buildShareUrl composes ${WEB_BASE_URL}/s/${code}', () => {
  const svc = new ShortUrlService('https://aya.app');
  assert.equal(svc.buildShareUrl('k7Qm2pX9'), 'https://aya.app/s/k7Qm2pX9');
});

test('buildShareUrl tolerates a trailing slash on the base URL', () => {
  const svc = new ShortUrlService('https://aya.dev/');
  assert.equal(svc.buildShareUrl('abcd1234'), 'https://aya.dev/s/abcd1234');
});

test('service.generateShareCode produces valid codes', () => {
  const svc = new ShortUrlService('https://aya.app');
  assert.match(svc.generateShareCode(), URL_SAFE_BASE62);
});

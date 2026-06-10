import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthResponseSchema } from '@aya/shared';
import { healthHandler } from './health.js';

test('healthHandler returns 200 with a valid HealthResponse', () => {
  const res = healthHandler();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.version, 'string');
  assert.equal(HealthResponseSchema.safeParse(res.body).success, true);
});

test('healthHandler reports AYA_VERSION when set', () => {
  const prev = process.env['AYA_VERSION'];
  process.env['AYA_VERSION'] = '9.9.9';
  try {
    assert.equal(healthHandler().body.version, '9.9.9');
  } finally {
    if (prev === undefined) delete process.env['AYA_VERSION'];
    else process.env['AYA_VERSION'] = prev;
  }
});

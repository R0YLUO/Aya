import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createStructuredRunner, withRetry } from './model.js';
import { PROVIDERS, type ModelSpec, type ProviderId } from './config.js';

const Schema = z.object({ value: z.string() });

function specFor(provider: ProviderId): ModelSpec {
  const info = PROVIDERS[provider];
  return {
    provider,
    model: 'dummy-model',
    temperature: 0,
    maxTokens: 1024,
    apiKey: 'dummy-key',
    sendTemperature: info.sendTemperature,
    maxTokensField: info.maxTokensField,
  };
}

// Construction is offline (no network until .invoke). This proves the universal
// loader resolves each provider's integration package and binds structured output.
for (const provider of Object.keys(PROVIDERS) as ProviderId[]) {
  test(`createStructuredRunner builds a runner for provider "${provider}"`, async () => {
    const runner = await createStructuredRunner(specFor(provider), Schema);
    assert.equal(typeof runner.invoke, 'function');
  });
}

test('withRetry retries the configured number of times then resolves', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    },
    { maxAttempts: 3, baseDelayMs: 0, sleep: async () => {} },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

// Playwright e2e configuration for the web reader (see ADR-0011 and the
// ui-verify skill). The run is hermetic: Playwright boots BOTH servers —
// the fixture stub API (e2e/stub-server.mjs) and `next dev` pointed at it via
// AYA_API_BASE_URL — so no deployed backend or network access is needed.

import { defineConfig, devices } from '@playwright/test';

const STUB_PORT = 4545;
const WEB_PORT = 3100;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    // Failure artifacts an agent (or human) can open after a red run.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/stub-server.mjs',
      url: `${STUB_URL}/health`,
      reuseExistingServer: !process.env['CI'],
      env: { STUB_PORT: String(STUB_PORT) },
    },
    {
      command: `npx next dev --port ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: { AYA_API_BASE_URL: STUB_URL },
    },
  ],
});

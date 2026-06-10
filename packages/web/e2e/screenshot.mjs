// Ad-hoc UI verification: load a page in headless Chromium and save a full-page
// screenshot an agent can Read and judge visually (see the ui-verify skill).
//
// Expects the e2e servers to be running already:
//   node e2e/stub-server.mjs                                   (port 4545)
//   AYA_API_BASE_URL=http://127.0.0.1:4545 npx next dev --port 3100
//
// Usage:
//   node e2e/screenshot.mjs <url-or-path> [outfile.png]
//   node e2e/screenshot.mjs /s/e2etest1            → e2e-artifacts/s-e2etest1.png

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [, , target, outArg] = process.argv;
if (!target) {
  console.error('Usage: node e2e/screenshot.mjs <url-or-path> [outfile.png]');
  console.error('  e.g. node e2e/screenshot.mjs /s/e2etest1');
  process.exit(2);
}

const url = target.startsWith('http')
  ? target
  : `http://127.0.0.1:3100${target.startsWith('/') ? '' : '/'}${target}`;
const defaultName = new URL(url).pathname.replace(/\W+/g, '-').replace(/^-+|-+$/g, '') || 'page';
const outfile = outArg ?? path.join('e2e-artifacts', `${defaultName}.png`);
mkdirSync(path.dirname(outfile), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 1200 },
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outfile, fullPage: true });
  console.log(`Saved ${outfile}`);
} finally {
  await browser.close();
}

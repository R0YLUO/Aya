// E2e coverage for the share reader (/s/{code}) in a real browser, against the
// hermetic stub API (see stub-server.mjs). These tests assert the behaviours
// the unit tests cannot: SSR wiring through AYA_API_BASE_URL, the
// reconstruction invariant as actually painted in the DOM, and the
// "no network on hover" UX north star.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import type { AnalyzedPage } from '@aya/shared';

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'e2etest1.json'), 'utf8'),
) as AnalyzedPage;

const interactivePhrases = [...fixture.phrases]
  .sort((a, b) => a.index - b.index)
  .filter((p) => p.pinyin !== null);

const IDIOM = '风雨无阻';
const idiom = fixture.phrases.find((p) => p.original === IDIOM)!;

test.describe('shared page reader (/s/{code})', () => {
  test('reconstructs the page text exactly in the DOM', async ({ page }) => {
    await page.goto('/s/e2etest1');
    const article = page.getByRole('article', { name: 'Shared page' });
    await expect(article).toBeVisible();
    // Exact match, line breaks included — the reconstruction invariant,
    // verified end-to-end in a real browser rather than on the wire.
    expect(await article.textContent()).toBe(fixture.page.fullText);
  });

  test('renders every analysed phrase as a tappable control, in order', async ({ page }) => {
    await page.goto('/s/e2etest1');
    const phrases = page.getByTestId('phrase');
    await expect(phrases).toHaveCount(interactivePhrases.length);
    await expect(phrases).toHaveText(interactivePhrases.map((p) => p.original));
  });

  test('hovering a phrase shows its analysis with no network request', async ({ page }) => {
    await page.goto('/s/e2etest1');
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/shares/')) apiRequests.push(request.url());
    });

    await page.getByTestId('phrase').filter({ hasText: IDIOM }).hover();

    await expect(page.getByTestId('phrase-popup')).toBeVisible();
    await expect(page.getByTestId('popup-pinyin')).toHaveText(idiom.pinyin!);
    await expect(page.getByTestId('popup-translation')).toHaveText(idiom.translation!);
    await expect(page.getByTestId('popup-contextual')).toHaveText(idiom.contextualMeaning!);
    // Everything came from the page already in memory (UX north star).
    expect(apiRequests).toEqual([]);
  });

  test('Escape dismisses the popup', async ({ page }) => {
    await page.goto('/s/e2etest1');
    await page.getByTestId('phrase').filter({ hasText: IDIOM }).hover();
    await expect(page.getByTestId('phrase-popup')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('phrase-popup')).toHaveCount(0);
  });

  test('keyboard focus opens the popup; blur closes it', async ({ page }) => {
    await page.goto('/s/e2etest1');
    const trigger = page.getByTestId('phrase').filter({ hasText: IDIOM });

    await trigger.focus();
    await expect(page.getByTestId('phrase-popup')).toBeVisible();

    await trigger.blur();
    await expect(page.getByTestId('phrase-popup')).toHaveCount(0);
  });

  test('an unknown share code renders the friendly not-found state', async ({ page }) => {
    await page.goto('/s/does-not-exist');
    // Note: Next.js adds its own role=alert route announcer, so target the
    // not-found view's heading rather than the bare alert role.
    await expect(page.getByRole('heading', { name: 'This page isn’t available' })).toBeVisible();
    await expect(page.getByTestId('phrase')).toHaveCount(0);
  });
});

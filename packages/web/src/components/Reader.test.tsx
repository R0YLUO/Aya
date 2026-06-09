import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Reader, isInteractive } from './Reader';
import type { AnalyzedPage, Phrase } from '@aya/shared';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

function word(index: number, original: string, pinyin: string): Phrase {
  return {
    id: `w${index}`,
    pageId: PAGE_ID,
    index,
    original,
    pinyin,
    translation: 'x',
    contextualMeaning: 'y',
  };
}

function punct(index: number, original: string): Phrase {
  return {
    id: `p${index}`,
    pageId: PAGE_ID,
    index,
    original,
    pinyin: null,
    translation: null,
    contextualMeaning: null,
  };
}

// "他好\n吗？" — words 他 好 吗, a newline token, and a question mark.
const page: AnalyzedPage = {
  page: { id: PAGE_ID, fullText: '他好\n吗？', createdAt: '2026-06-08T10:12:00.000Z' },
  phrases: [
    word(1, '他', 'tā'),
    word(2, '好', 'hǎo'),
    punct(3, '\n'),
    word(4, '吗', 'ma'),
    punct(5, '？'),
  ],
};

describe('isInteractive', () => {
  it('is interactive when pinyin is present', () => {
    expect(isInteractive(word(1, '他', 'tā'))).toBe(true);
  });
  it('is not interactive when analysis is null', () => {
    expect(isInteractive(punct(1, '，'))).toBe(false);
  });
});

describe('Reader', () => {
  it('renders pinyin-bearing phrases as focusable interactive elements', () => {
    render(<Reader page={page} />);
    const interactive = screen.getAllByTestId('phrase');
    expect(interactive).toHaveLength(3); // 他 好 吗
    for (const el of interactive) {
      expect(el.tagName).toBe('BUTTON');
      // A button is focusable by default (no negative tabindex).
      expect(el).not.toHaveAttribute('tabindex', '-1');
    }
    expect(interactive.map((el) => el.textContent)).toEqual(['他', '好', '吗']);
  });

  it('renders null-analysis tokens as plain non-interactive text', () => {
    render(<Reader page={page} />);
    // The punctuation/newline tokens are not buttons.
    const buttons = screen.queryAllByRole('button');
    expect(buttons.map((b) => b.textContent)).not.toContain('？');
    expect(buttons.map((b) => b.textContent)).not.toContain('\n');
  });

  it('reproduces fullText in index order including line breaks', () => {
    const { container } = render(<Reader page={page} />);
    const article = container.querySelector('article')!;
    expect(article.textContent).toBe(page.page.fullText);
  });

  it('sorts phrases by index even when the input is unordered', () => {
    const shuffled: AnalyzedPage = {
      ...page,
      phrases: [page.phrases[4]!, page.phrases[1]!, page.phrases[3]!, page.phrases[0]!, page.phrases[2]!],
    };
    const { container } = render(<Reader page={shuffled} />);
    expect(container.querySelector('article')!.textContent).toBe('他好\n吗？');
  });

  it('renders a long (100+ phrase) page without error', () => {
    const phrases: Phrase[] = [];
    let i = 1;
    let expected = '';
    for (let n = 0; n < 60; n++) {
      phrases.push(word(i, '学', 'xué'));
      expected += '学';
      i++;
      phrases.push(punct(i, '，'));
      expected += '，';
      i++;
    }
    const longPage: AnalyzedPage = {
      page: { id: PAGE_ID, fullText: expected, createdAt: '2026-06-08T10:12:00.000Z' },
      phrases,
    };
    const { container } = render(<Reader page={longPage} />);
    expect(screen.getAllByTestId('phrase')).toHaveLength(60);
    expect(container.querySelector('article')!.textContent).toBe(expected);
  });
});

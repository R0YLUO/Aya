import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderWithPopups } from './ReaderWithPopups';
import type { AnalyzedPage, Phrase } from '@aya/shared';

const PAGE_ID = '0f2e0000-0000-4000-8000-000000000000';

function word(index: number, original: string, p: Partial<Phrase> = {}): Phrase {
  return {
    id: `w${index}`,
    pageId: PAGE_ID,
    index,
    original,
    pinyin: 'tā',
    translation: 'he',
    contextualMeaning: 'the person described',
    ...p,
  };
}

function punct(index: number, original: string): Phrase {
  return {
    id: `pn${index}`,
    pageId: PAGE_ID,
    index,
    original,
    pinyin: null,
    translation: null,
    contextualMeaning: null,
  };
}

const page: AnalyzedPage = {
  page: { id: PAGE_ID, fullText: '他，', createdAt: '2026-06-08T10:12:00.000Z' },
  phrases: [
    word(1, '他', {
      pinyin: 'tā',
      translation: 'he',
      contextualMeaning: 'the speaker’s friend',
    }),
    punct(2, '，'),
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('hover-to-translate popup', () => {
  it('shows pinyin, translation, and contextual meaning on hover without a network call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<ReaderWithPopups page={page} />);

    expect(screen.queryByTestId('phrase-popup')).toBeNull();

    const phrase = screen.getByTestId('phrase');
    fireEvent.mouseEnter(phrase);

    const popup = screen.getByTestId('phrase-popup');
    expect(popup).toBeInTheDocument();
    expect(screen.getByTestId('popup-pinyin')).toHaveTextContent('tā');
    expect(screen.getByTestId('popup-translation')).toHaveTextContent('he');
    expect(screen.getByTestId('popup-contextual')).toHaveTextContent(
      'the speaker’s friend',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dismisses on mouse-out', () => {
    render(<ReaderWithPopups page={page} />);
    const phrase = screen.getByTestId('phrase');
    fireEvent.mouseEnter(phrase);
    expect(screen.getByTestId('phrase-popup')).toBeInTheDocument();

    // Mouse leaves the phrase region (wrapper onMouseLeave).
    fireEvent.mouseLeave(phrase.parentElement!);
    expect(screen.queryByTestId('phrase-popup')).toBeNull();
  });

  it('dismisses on Escape', async () => {
    const user = userEvent.setup();
    render(<ReaderWithPopups page={page} />);
    const phrase = screen.getByTestId('phrase');
    fireEvent.mouseEnter(phrase);
    expect(screen.getByTestId('phrase-popup')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('phrase-popup')).toBeNull();
  });

  it('shows the popup on keyboard focus too', () => {
    render(<ReaderWithPopups page={page} />);
    const phrase = screen.getByTestId('phrase');
    fireEvent.focus(phrase);
    expect(screen.getByTestId('phrase-popup')).toBeInTheDocument();
    fireEvent.blur(phrase);
    expect(screen.queryByTestId('phrase-popup')).toBeNull();
  });

  it('never shows a popup for a non-interactive token', () => {
    render(<ReaderWithPopups page={page} />);
    // The punctuation token is plain text, not a button, so there is nothing to
    // hover that would open a popup.
    const buttons = screen.getAllByTestId('phrase');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('他');
    expect(screen.getByText('，')).not.toHaveAttribute('data-testid', 'phrase');
  });
});

'use client';

// Hover-to-translate popup for the web reader.
//
// On mouse-over (or keyboard focus) of an interactive phrase, a small popup
// shows the phrase's analysis: pinyin, contextual translation, and contextual
// meaning (the MVP fields per ADR-0003 — character breakdown and example
// sentences are deferred). All data comes from the AnalyzedPage already in
// memory, so NO network request is made on hover (North Star: UX — instant).
//
// Dismissal: pointer leaving the phrase, blur, or pressing Escape.

import { useCallback, useEffect, useId, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cloneElement } from 'react';
import type { Phrase } from '@aya/shared';
import type { PhraseTrigger } from './Reader';

export interface InteractivePhraseProps {
  phrase: Phrase;
  /** The bare interactive element produced by the Reader (a focusable button). */
  trigger: PhraseTrigger;
}

/**
 * Wraps the Reader's interactive element, adding the hover/focus popup. The
 * popup only renders for phrases that carry analysis; the Reader never asks us
 * to wrap a null-analysis token, but we guard anyway so a stray call is a no-op.
 */
export function InteractivePhrase({ phrase, trigger }: InteractivePhraseProps) {
  const [open, setOpen] = useState(false);
  const popupId = useId();

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  // Escape closes the popup while it is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // A non-word token should never trigger a popup — render the trigger as-is.
  if (phrase.pinyin === null) {
    return trigger;
  }

  const handlerProps: ButtonHTMLAttributes<HTMLButtonElement> = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };
  if (open) {
    handlerProps['aria-describedby'] = popupId;
  }
  const triggerWithHandlers = cloneElement(trigger, handlerProps);

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      // Catch mouse-out at the wrapper so moving onto the popup itself keeps it
      // open, but leaving the whole region dismisses it.
      onMouseLeave={hide}
    >
      {triggerWithHandlers}
      {open ? (
        <span
          id={popupId}
          role="tooltip"
          data-testid="phrase-popup"
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            zIndex: 10,
            minWidth: '12rem',
            maxWidth: '20rem',
            marginTop: '0.25rem',
            padding: '0.625rem 0.75rem',
            borderRadius: '0.5rem',
            background: '#1f2430',
            color: '#f5f6f8',
            fontSize: '0.95rem',
            lineHeight: 1.4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            textAlign: 'left',
            whiteSpace: 'normal',
          }}
        >
          <span
            data-testid="popup-pinyin"
            style={{ display: 'block', fontWeight: 600 }}
          >
            {phrase.pinyin}
          </span>
          <span data-testid="popup-translation" style={{ display: 'block' }}>
            {phrase.translation}
          </span>
          {phrase.contextualMeaning ? (
            <span
              data-testid="popup-contextual"
              style={{ display: 'block', opacity: 0.85, marginTop: '0.25rem' }}
            >
              {phrase.contextualMeaning}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

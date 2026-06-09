# Product Requirements Document

## Executive Summary

Aya is a Chinese Reading Companion that solves a core pain point for intermediate Chinese language learners: the friction of reading physical Chinese books. When encountering an unfamiliar word or idiom, learners must break their reading flow to look up definitions — and in Chinese, meaning often depends on multi-character combinations (e.g., four-character idioms, compound nouns) that can't be understood character-by-character.

The Reading Companion lets users photograph any page of a Chinese book. The app performs OCR and LLM-powered semantic segmentation to extract and parse the text into meaningful phrase units — not raw characters. The user sees a clean, scrollable text view on their phone, where they can tap any phrase to instantly see its pinyin, English translation, and contextual meaning breakdown.

This is the foundational capability of Aya: making Chinese books approachable for intermediate learners by bringing instant, contextual understanding to their fingertips — without leaving the reading experience.

## User Personas

### Primary: The Intermediate Reader ("Book Learner")
- **Role**: Adult learner of Mandarin Chinese, intermediate level (HSK 3–5 equivalent)
- **Goals**: Read authentic Chinese novels, short stories, or non-fiction without constantly stopping to look things up
- **Pain Points**: Idioms and compound words derail reading flow; character-by-character lookup returns wrong meanings; switching between apps breaks concentration
- **Technical Level**: Comfortable with smartphones; not a developer
- **Context**: Reading at home, in a café, on a commute — anywhere they have their phone

---

## User Stories & Acceptance Criteria

### Story 1: Photograph a Book Page

**As an** intermediate Chinese learner
**I want to** take a photo of a page from my Chinese book using the app
**So that** I can get the text extracted and ready for interactive reading

**Acceptance Criteria:**
- [ ] App presents a camera view for capturing the page
- [ ] User is able to confirm the photo before submission, and retake if needed
- [ ] If photo is too blurry or text is unrecognizable, app shows a clear error message and prompts the user to retake
- [ ] A loading state is shown during OCR + LLM processing, indicating the app is working
- [ ] Simplified Chinese text is correctly extracted and segmented

---

### Story 2: Read the Extracted Text

**As an** intermediate Chinese learner
**I want to** see the extracted text displayed clearly on my screen as tappable semantic phrases
**So that** I can read at my own pace and identify phrases I don't recognize

**Acceptance Criteria:**
- [ ] Extracted text is shown as a plain, scrollable view
- [ ] Text is segmented into semantic phrase units (not character-by-character), e.g., idioms and compound words are kept together
- [ ] Each phrase unit is individually tappable
- [ ] Text is legible and appropriately sized for mobile reading

---

### Story 3: Look Up a Phrase

**As an** intermediate Chinese learner
**I want to** tap on a phrase I don't recognize
**So that** I can instantly understand its meaning in the context of the passage

**Acceptance Criteria:**
- [ ] Tapping a phrase opens a popup/bottom sheet
- [ ] Popup displays: pinyin (with tone marks), contextual English translation (using surrounding text for meaning), individual character breakdown, and at least one example sentence
- [ ] Translation reflects the phrase's meaning *in context*, not just a dictionary definition
- [ ] Popup can be dismissed easily (tap outside or swipe down)
---

## Functional Requirements

### Core Features

**Feature 1: Photo Capture & Submission**
- Description: User opens app and is presented with a camera view. They photograph a page of a Chinese book. The image is submitted to the backend.
- User flow: Open app → tap camera button → frame page → capture → preview → confirm → submit
- Edge cases:
  - Blurry or dark photo: OCR confidence score below threshold → show "Photo unclear, please retake" error
  - No Chinese text detected: Show "No Chinese text found, please try again"
  - Network failure during upload: Show retry option
- Error handling: All errors shown inline with a clear CTA to retry or retake

**Feature 2: OCR + Semantic Segmentation (Backend)**
- Description: The submitted image is processed by Claude (vision + language) to: (1) extract the Simplified Chinese text via OCR, and (2) parse the full text into semantically meaningful phrase units, preserving idioms, compound words, and contextual groupings.
- Output: A structured list of phrase tokens with their positions in the original text
- Note: Segmentation must consider the full passage context for its semantic meaning, not phrase-by-phrase in isolation

**Feature 3: Interactive Text Reader**
- Description: The processed text is rendered as a clean, scrollable view. Each phrase token is a tappable element.
- Display: Plain scrollable text — no image overlay, no side-by-side view
- Interaction: Tap any phrase → popup appears

**Feature 4: Phrase Lookup Popup**
- Description: A popup/bottom sheet appears when a phrase is tapped, showing all analysis for that phrase
- Contents:
  - Pinyin with tone marks (e.g., "成语 → chéng yǔ")
  - English translation — contextual (e.g., "as used here, this means...")
  - Character breakdown — meaning of each individual character in the phrase
  - Example sentence — one example of the phrase used in another context
- Dismissal: tap outside, swipe down, or tap a close button

### Out of Scope (MVP)
- Audio playback or text-to-speech for pronunciation
- Saving words/phrases to a vocabulary list or flashcard deck
- Languages other than Simplified Chinese
- User accounts, login, or cross-device sync
- Reading history or saved pages
- Traditional Chinese script support
- Gamification, streaks, or progress tracking

---

## Technical Constraints

### Performance
- Processing time: Optimize for quality over speed; loading state will be shown. Target a reasonable upper bound of ~15 seconds for a full page; explore caching or streaming to improve perceived speed.
- The app should remain responsive during processing (no freezing UI)

### Security
- Photos are sent to a cloud API (Claude/Anthropic) for processing — no client-side storage of images after submission
- No PII collected in MVP; no user accounts
- Standard HTTPS for all API communication
- Privacy disclosure not required for MVP but should be added before public launch

### Integration
- **Claude API (Anthropic)**: Used for both OCR (vision input) and semantic segmentation + translation. Single API call where possible to reduce latency.
- **Backend**: A lightweight server (Node.js or equivalent) to proxy Claude API calls, manage API keys securely, and handle image uploads. The mobile app does not call Claude directly.
- **Mobile**: React Native (cross-platform iOS + Android)

### Technology Stack
- **Mobile**: React Native
- **Backend**: Cloud-hosted API server (tech choice TBD — Node.js recommended)
- **LLM + OCR**: Anthropic Claude (vision-capable model)
- **Script**: Simplified Chinese only
- **Platform**: iOS and Android

---

## MVP Scope & Phasing

### Phase 1: MVP (This PRD)
- Photo capture with retake on error
- Claude-powered OCR + semantic segmentation
- Plain scrollable tappable text reader
- Tap-to-translate popup (pinyin, translation, character breakdown, example sentence)

**MVP Definition**: A user can photograph a page of a Simplified Chinese book, read the extracted text on their phone, and tap any phrase to understand it — all within a single session, no account required.

### Phase 2: Web Companion (Shareable URL)
- After scanning, the app generates a short, unique URL for the session
- Opening the URL in a browser shows the same analyzed text in a larger web view
- Hover over any phrase (mouse) to trigger the same popup as the mobile tap
- Enables users to fully read from their computer without needing the phone during reading
- Use case: scan with phone, continue reading on laptop

### Future Considerations
- Vocabulary saving and spaced repetition flashcards
- Audio pronunciation via text-to-speech
- Traditional Chinese support
- User accounts with reading history and cross-device sync
- Gamification and learning progress tracking

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| OCR quality poor on hand-photographed books (lighting, angle, font) | High | High | Implement clear user guidance for photo quality; set confidence threshold and prompt retake; test with real books early |
| Claude segmentation splits idioms incorrectly | Medium | High | Test extensively with real Chinese literary text; include full passage context in prompt; allow user feedback |
| API latency too high for good UX | Medium | Medium | Show animated loading state with progress copy; explore streaming response to show text as it's processed |
| Claude API cost scaling with usage | Low (MVP) | Medium | Monitor token usage per scan; optimize prompt to minimize tokens; add usage limits if needed |
| React Native performance on older devices | Low | Low | Test on mid-range Android early; optimize rendering for long text lists |

---

## Dependencies & Blockers

**Dependencies:**
- Anthropic Claude API access (vision-capable model) — must be provisioned before backend development begins
- React Native environment setup — standard, no blockers expected
- Backend hosting infrastructure — lightweight, low cost for MVP

**Known Blockers:**
- None at this time

---

## Appendix

### Glossary
- **Semantic Phrase**: A unit of Chinese text that carries meaning together — e.g., a two-character compound word, a four-character idiom (成语), or a proper noun. Distinct from individual characters.
- **Pinyin**: The official romanization system for Mandarin Chinese, with tone marks (e.g., māo for 猫, "cat")
- **Simplified Chinese**: The standardized written form used in mainland China, as opposed to Traditional Chinese used in Taiwan and Hong Kong
- **OCR**: Optical Character Recognition — extracting text from an image
- **Segmentation**: Splitting a continuous string of Chinese characters into meaningful word/phrase units (Chinese has no spaces between words)

### References
- Anthropic Claude API documentation (vision + tool use)
- React Native documentation
- Phase 2 scope: web reader with shareable URL and hover-to-translate

---

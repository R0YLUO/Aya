import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StructuredRunner } from '@aya/llm';
import {
  scoreTranslation,
  loadJudgeConfig,
  buildJudgeSystemPrompt,
  buildJudgeUserMessage,
  JudgeRubricSchema,
  DEFAULT_JUDGE_THRESHOLD,
  JUDGE_DIMENSIONS,
  type JudgeRubric,
} from './translation.js';

/** A fake judge runner that returns a fixed rubric, capturing the messages. */
function fakeJudge(
  rubric: JudgeRubric,
  sink?: { messages?: unknown },
): StructuredRunner<JudgeRubric> {
  return {
    invoke(messages) {
      if (sink) sink.messages = messages;
      return Promise.resolve(rubric);
    },
  };
}

test('JudgeRubricSchema: rejects out-of-scale scores', () => {
  assert.throws(() =>
    JudgeRubricSchema.parse({
      faithfulness: 6,
      contextualCorrectness: 4,
      fluency: 4,
      rationale: 'x',
    }),
  );
  assert.throws(() =>
    JudgeRubricSchema.parse({
      faithfulness: 0,
      contextualCorrectness: 4,
      fluency: 4,
      rationale: 'x',
    }),
  );
  // Non-integer is rejected too.
  assert.throws(() =>
    JudgeRubricSchema.parse({
      faithfulness: 4.5,
      contextualCorrectness: 4,
      fluency: 4,
      rationale: 'x',
    }),
  );
});

test('JUDGE_DIMENSIONS are the three fixed rubric dimensions', () => {
  assert.deepEqual(
    [...JUDGE_DIMENSIONS],
    ['faithfulness', 'contextualCorrectness', 'fluency'],
  );
});

test('scoreTranslation: parses the judge rubric into per-dimension scores', async () => {
  const runner = fakeJudge({
    faithfulness: 5,
    contextualCorrectness: 4,
    fluency: 5,
    rationale: 'Captures the gift-giving sense.',
  });
  const result = await scoreTranslation(
    '意思',
    '这是我的一点小意思，请你收下。',
    'a small token of goodwill',
    'Reward a "small token / gesture" reading; penalise the literal "meaning".',
    { runner },
  );
  assert.equal(result.faithfulness, 5);
  assert.equal(result.contextualCorrectness, 4);
  assert.equal(result.fluency, 5);
  assert.equal(result.rationale, 'Captures the gift-giving sense.');
  assert.equal(result.threshold, DEFAULT_JUDGE_THRESHOLD);
  assert.equal(result.pass, true);
});

test('scoreTranslation: passes only when EVERY dimension meets the threshold', async () => {
  // One dimension below default threshold (4) → fail.
  const failing = await scoreTranslation('东西', 'ctx', 'east and west', 'notes', {
    runner: fakeJudge({
      faithfulness: 5,
      contextualCorrectness: 2,
      fluency: 5,
      rationale: 'Literal directions, wrong here.',
    }),
  });
  assert.equal(failing.pass, false);

  // All exactly at threshold → pass (>= is inclusive).
  const borderline = await scoreTranslation('东西', 'ctx', 'things', 'notes', {
    runner: fakeJudge({
      faithfulness: 4,
      contextualCorrectness: 4,
      fluency: 4,
      rationale: 'OK.',
    }),
  });
  assert.equal(borderline.pass, true);
});

test('scoreTranslation: a custom threshold changes the verdict', async () => {
  const rubric: JudgeRubric = {
    faithfulness: 4,
    contextualCorrectness: 4,
    fluency: 4,
    rationale: 'OK.',
  };
  // Threshold 5 is stricter than the all-4 scores → fail.
  const strict = await scoreTranslation('算了', 'ctx', 'forget it', 'notes', {
    runner: fakeJudge(rubric),
    threshold: 5,
  });
  assert.equal(strict.threshold, 5);
  assert.equal(strict.pass, false);

  // Threshold 3 is looser → pass.
  const loose = await scoreTranslation('算了', 'ctx', 'forget it', 'notes', {
    runner: fakeJudge(rubric),
    threshold: 3,
  });
  assert.equal(loose.pass, true);
});

test('scoreTranslation: sends a system + user message carrying phrase, context, candidate, and notes', async () => {
  const sink: { messages?: unknown } = {};
  await scoreTranslation('不择手段', 'ctx-passage', 'by any means', 'rubric-notes', {
    runner: fakeJudge(
      { faithfulness: 5, contextualCorrectness: 5, fluency: 5, rationale: 'r' },
      sink,
    ),
  });
  const messages = sink.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, 'system');
  assert.equal(messages[1]?.role, 'user');
  const user = messages[1]?.content ?? '';
  assert.ok(user.includes('不择手段'));
  assert.ok(user.includes('ctx-passage'));
  assert.ok(user.includes('by any means'));
  assert.ok(user.includes('rubric-notes'));
});

test('scoreTranslation: re-validates judge output (out-of-scale runner output throws)', async () => {
  const badRunner: StructuredRunner<JudgeRubric> = {
    invoke() {
      // Bypass the schema as a misbehaving runner would.
      return Promise.resolve({
        faithfulness: 9,
        contextualCorrectness: 4,
        fluency: 4,
        rationale: 'r',
      } as JudgeRubric);
    },
  };
  await assert.rejects(() =>
    scoreTranslation('意思', 'ctx', 'candidate', 'notes', { runner: badRunner }),
  );
});

test('loadJudgeConfig: resolves provider + model + key, fixes temperature 0', () => {
  const cfg = loadJudgeConfig({
    AYA_LLM_PROVIDER: 'anthropic',
    AYA_JUDGE_MODEL: 'judge-model-xyz',
    ANTHROPIC_API_KEY: 'sk-test',
  });
  assert.equal(cfg.provider, 'anthropic');
  assert.equal(cfg.model, 'judge-model-xyz');
  assert.equal(cfg.temperature, 0);
  assert.equal(cfg.apiKey, 'sk-test');
});

test('loadJudgeConfig: AYA_JUDGE_PROVIDER pins the judge independent of the pipeline', () => {
  const cfg = loadJudgeConfig({
    AYA_LLM_PROVIDER: 'openai',
    AYA_JUDGE_PROVIDER: 'anthropic',
    AYA_JUDGE_MODEL: 'judge-model-xyz',
    ANTHROPIC_API_KEY: 'sk-test',
  });
  assert.equal(cfg.provider, 'anthropic');
  assert.equal(cfg.apiKey, 'sk-test');
});

test('loadJudgeConfig: throws when the judge model id is missing', () => {
  assert.throws(
    () => loadJudgeConfig({ AYA_LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test' }),
    /AYA_JUDGE_MODEL/,
  );
});

test('the prompt builders are deterministic strings naming all three dimensions', () => {
  const sys = buildJudgeSystemPrompt();
  assert.ok(sys.includes('faithfulness'));
  assert.ok(sys.includes('contextualCorrectness'));
  assert.ok(sys.includes('fluency'));
  // No model id baked into the prompt.
  assert.ok(!/claude-/.test(sys));
  const user = buildJudgeUserMessage('P', 'C', 'CAND', 'N');
  assert.ok(user.includes('P') && user.includes('C') && user.includes('CAND') && user.includes('N'));
});

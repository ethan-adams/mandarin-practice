import { describe, expect, it } from 'vitest';
import {
  MANDARIN_CONTRAST_PAIRS,
  appendListeningResult,
  appendPronunciationEvidence,
  completeListeningRound,
  contrastCategoryForPinyin,
  createContrastDrill,
  createListeningRound,
  explainPronunciationEvidence,
  listeningPair,
  markListeningAudioUnavailable,
  recommendContrastDrill,
  resetPronunciationEvidence,
  revealListeningAnswer,
  selectListeningAnswer,
  updateContrastDrill,
  type PronunciationEvidence,
  type ListeningHistory,
} from './mandarinContrastPractice';

describe('Mandarin contrast catalog and evidence explanations', () => {
  it('covers every supported contrast with contextual, speakable choices', () => {
    expect(new Set(MANDARIN_CONTRAST_PAIRS.map((pair) => pair.category))).toEqual(
      new Set(['tone', 'zh_z', 'ch_c', 'sh_s', 'n_l', 'jqx_u', 'in_ing']),
    );
    for (const pair of MANDARIN_CONTRAST_PAIRS) {
      for (const cue of [pair.target, pair.contrast]) {
        expect(cue.han).toBeTruthy();
        expect(cue.pinyin).toBeTruthy();
        expect(cue.gloss).toBeTruthy();
        expect(cue.speechPhonemes).toBeTruthy();
      }
    }
    expect(MANDARIN_CONTRAST_PAIRS.find((pair) => pair.id === 'zh-z')?.target.speechPhonemes).toBe('ㄓ十1ㄉㄠ4');
    expect(MANDARIN_CONTRAST_PAIRS.find((pair) => pair.id === 'ch-c')?.contrast.speechPhonemes).toBe('ㄘㄭ2ㄉ言3');
  });

  it('maps contextual pinyin to supported contrast categories', () => {
    expect(contrastCategoryForPinyin('zhīdào')).toBe('zh_z');
    expect(contrastCategoryForPinyin('chī fàn')).toBe('ch_c');
    expect(contrastCategoryForPinyin('lǚ yóu')).toBe('n_l');
    expect(contrastCategoryForPinyin('qū')).toBe('jqx_u');
    expect(contrastCategoryForPinyin('jīng cháng')).toBe('in_ing');
    expect(contrastCategoryForPinyin('mǎ')).toBe('tone');
  });

  it('never turns unsupported or missing recognition evidence into a phonetic claim', () => {
    const unavailable = explainPronunciationEvidence({
      expectedUnit: '妈', expectedPinyin: 'mā', observedUnit: null,
      recognitionAvailable: false, hasTranscript: false, toneStatus: 'matched',
    });
    expect(unavailable.kind).toBe('unverified');
    expect(unavailable.detail).toContain('syllable is unverified');
    expect(unavailable.detail).not.toMatch(/tongue|final was|initial was/i);

    const wrongUnit = explainPronunciationEvidence({
      expectedUnit: '妈', expectedPinyin: 'mā', observedUnit: null,
      recognitionAvailable: true, hasTranscript: true, toneStatus: 'matched',
    });
    expect(wrongUnit.kind).toBe('unit_not_recognized');
    expect(wrongUnit.detail).toContain('tone contour passed');

    const wrongTone = explainPronunciationEvidence({
      expectedUnit: '妈', expectedPinyin: 'mā', observedUnit: '妈',
      recognitionAvailable: true, hasTranscript: true, toneStatus: 'missed',
    });
    expect(wrongTone.kind).toBe('tone_not_passed');
    expect(wrongTone.detail).toContain('The app heard 妈');

    const noSpeech = explainPronunciationEvidence({
      expectedUnit: '妈', expectedPinyin: 'mā', observedUnit: null,
      recognitionAvailable: true, hasTranscript: false, toneStatus: null,
    });
    expect(noSpeech.kind).toBe('partial_or_no_speech');
  });
});

describe('adaptive pronunciation evidence and drill state', () => {
  const miss = (timestamp: string, overrides: Partial<PronunciationEvidence> = {}): PronunciationEvidence => ({
    expectedUnit: '知',
    category: 'zh_z',
    assessmentStatus: 'missed',
    confidence: 0.91,
    timestamp,
    manualRating: 'wrong',
    ...overrides,
  });

  it('recommends only repeated, high-confidence misses from separate attempts', () => {
    expect(recommendContrastDrill([miss('attempt-1')])).toBeNull();
    expect(recommendContrastDrill([miss('attempt-1'), miss('attempt-1')])).toBeNull();
    expect(recommendContrastDrill([miss('attempt-1'), miss('attempt-2', { confidence: 0.4 })])).toBeNull();
    expect(recommendContrastDrill([miss('attempt-1'), miss('attempt-2', { assessmentStatus: 'no_speech' })])).toBeNull();
    expect(recommendContrastDrill([miss('attempt-1'), miss('attempt-2', { manualRating: 'correct' })])).toBeNull();

    const recommendation = recommendContrastDrill([miss('attempt-1'), miss('attempt-2')]);
    expect(recommendation?.category).toBe('zh_z');
    expect(recommendation?.qualifyingAttempts).toBe(2);
  });

  it('stores a compact, bounded evidence record with no transcript or audio fields', () => {
    let evidence: PronunciationEvidence[] = [];
    for (let index = 0; index < 90; index += 1) evidence = appendPronunciationEvidence(evidence, miss(`attempt-${index}`));
    expect(evidence).toHaveLength(80);
    expect(Object.keys(evidence[0]).sort()).toEqual(
      ['assessmentStatus', 'category', 'confidence', 'expectedUnit', 'manualRating', 'timestamp'].sort(),
    );
    expect(resetPronunciationEvidence()).toEqual([]);
  });

  it('supports hear target, hear contrast, speak, rate, retry, and skip transitions', () => {
    let state = createContrastDrill('zh-z');
    state = updateContrastDrill(state, 'target_played');
    expect(state.step).toBe('hear_contrast');
    state = updateContrastDrill(state, 'contrast_played');
    expect(state.step).toBe('speak_target');
    state = updateContrastDrill(state, 'spoke');
    expect(state.step).toBe('rate');
    state = updateContrastDrill(state, 'retry');
    expect(state).toMatchObject({ step: 'hear_target', retries: 1 });
    state = updateContrastDrill(state, 'skip');
    expect(state.step).toBe('complete');

    let rated = createContrastDrill('zh-z');
    rated = updateContrastDrill(rated, 'target_played');
    rated = updateContrastDrill(rated, 'contrast_played');
    rated = updateContrastDrill(rated, 'spoke');
    rated = updateContrastDrill(rated, 'hard');
    expect(rated).toMatchObject({ step: 'complete', rating: 'hard' });
  });
});

describe('listening discrimination state', () => {
  it('selects every seeded pair deterministically across one catalog cycle', () => {
    const first = Array.from({ length: MANDARIN_CONTRAST_PAIRS.length }, (_, index) => createListeningRound('local-seed', index));
    const second = Array.from({ length: MANDARIN_CONTRAST_PAIRS.length }, (_, index) => createListeningRound('local-seed', index));
    expect(second).toEqual(first);
    expect(new Set(first.map((round) => round.pairId)).size).toBe(MANDARIN_CONTRAST_PAIRS.length);
  });

  it('evaluates answers, records confidence locally, and handles audio failure', () => {
    let round = createListeningRound('test-seed', 0);
    const pair = listeningPair(round);
    const correctCue = pair.target.id === round.heardCueId ? pair.target : pair.contrast;
    round = selectListeningAnswer(round, correctCue.id);
    round = revealListeningAnswer(round);
    expect(round.correct).toBe(true);

    const completion = completeListeningRound(round, 'high', '2026-07-10T12:00:00.000Z');
    expect(completion.result).toEqual({
      pairId: round.pairId,
      heardCueId: round.heardCueId,
      correct: true,
      confidence: 'high',
      timestamp: '2026-07-10T12:00:00.000Z',
    });
    expect(Object.keys(completion.result ?? {})).not.toContain('audio');
    expect(markListeningAudioUnavailable(round).audioUnavailable).toBe(true);
  });

  it('keeps compact local results without losing the deterministic sequence count', () => {
    const result = {
      pairId: 'zh-z', heardCueId: 'zhidao', correct: true, confidence: 'high' as const, timestamp: 'now',
    };
    let history: ListeningHistory = { results: [], totalCompleted: 0 };
    for (let index = 0; index < 225; index += 1) {
      history = appendListeningResult(history.results, history.totalCompleted, { ...result, timestamp: String(index) });
    }
    expect(history.results).toHaveLength(200);
    expect(history.totalCompleted).toBe(225);
    expect(history.results[0].timestamp).toBe('25');
  });

  it('does not reveal or complete before an answer is chosen', () => {
    const round = createListeningRound('test-seed', 1);
    expect(revealListeningAnswer(round)).toEqual(round);
    expect(completeListeningRound(round, 'low', 'now').result).toBeNull();
  });
});

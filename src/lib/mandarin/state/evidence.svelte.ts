// Pronunciation evidence (high-confidence misses that drive the adaptive
// contrast-drill recommendation) and the optional contrast-drill flow.
// Neither ever changes card scheduling.

import {
  MANDARIN_CONTRAST_PAIRS,
  appendPronunciationEvidence,
  contrastCategoryForPinyin,
  createContrastDrill,
  recommendContrastDrill,
  resetPronunciationEvidence,
  updateContrastDrill,
  type ContrastDrillState,
  type PronunciationEvidence,
} from '../../utils/mandarinContrastPractice';
import type { PronunciationResult } from '../../utils/mandarinPronunciation';
import type { Rating } from '../logic/srs';
import type { CharacterFeedback } from './toneCoach.svelte';

import { pronunciationEvidenceStorageKey } from './storageKeys';

export type DrillAction = 'target_played' | 'contrast_played' | 'spoke' | 'retry' | 'skip' | Rating;

export class EvidenceStore {
  evidence = $state<PronunciationEvidence[]>([]);
  activeDrill = $state<ContrastDrillState | null>(null);

  recommendation = $derived(recommendContrastDrill(this.evidence));
  activeDrillPair = $derived(
    this.activeDrill ? (MANDARIN_CONTRAST_PAIRS.find((pair) => pair.id === this.activeDrill?.pairId) ?? null) : null,
  );

  load() {
    try {
      const stored = JSON.parse(localStorage.getItem(pronunciationEvidenceStorageKey) ?? '[]');
      this.evidence = Array.isArray(stored) ? stored : [];
    } catch {
      this.evidence = [];
    }
  }

  record(
    feedback: CharacterFeedback[],
    recognitionResult: (PronunciationResult & { transcript: string; confidence: number }) | null,
    rating: Rating,
  ) {
    if (!recognitionResult || !feedback.length) return;
    const timestamp = new Date().toISOString();
    let next = this.evidence;
    for (const unit of feedback) {
      if (unit.status !== 'missed' && unit.status !== 'close' && unit.status !== 'unverified') continue;
      const category = contrastCategoryForPinyin(unit.pinyin);
      if (!category) continue;
      next = appendPronunciationEvidence(next, {
        expectedUnit: unit.text,
        category,
        assessmentStatus:
          recognitionResult.status === 'no_speech' ? 'no_speech' : unit.status === 'unverified' ? 'unverified' : unit.status,
        confidence: recognitionResult.confidence,
        timestamp,
        manualRating: rating,
      });
    }
    this.evidence = next;
    localStorage.setItem(pronunciationEvidenceStorageKey, JSON.stringify(this.evidence));
  }

  clear() {
    this.evidence = resetPronunciationEvidence();
    this.activeDrill = null;
    localStorage.removeItem(pronunciationEvidenceStorageKey);
  }

  beginDrill(pairId: string) {
    this.activeDrill = createContrastDrill(pairId);
  }

  updateDrill(action: DrillAction) {
    if (!this.activeDrill) return;
    this.activeDrill = updateContrastDrill(this.activeDrill, action);
  }

  closeDrill() {
    this.activeDrill = null;
  }
}

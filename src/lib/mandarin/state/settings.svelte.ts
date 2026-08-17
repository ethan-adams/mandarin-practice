// Display and audio preferences for a practice session (not persisted).

import { MANDARIN_VOICES, type MandarinVoice, type MandarinVoiceMode } from '../../utils/mandarinSpeech';

export class PracticeSettings {
  showPinyin = $state(true);
  toneColors = $state(true);
  autoSpeak = $state(true);
  voiceMode = $state<MandarinVoiceMode>('variety');
  singleVoice = $state<MandarinVoice>(MANDARIN_VOICES[0]);
}

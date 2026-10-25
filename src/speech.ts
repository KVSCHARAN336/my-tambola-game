/**
 * Web Speech API Synthesizer with iOS Safari WebKit unlocking
 * Format: Number name followed by individual digits (e.g. "Forty two, four two")
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'
];

const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety'
];

export function numberToWords(num: number): string {
  if (num < 20) return ONES[num];
  const t = Math.floor(num / 10);
  const o = num % 10;
  return o > 0 ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

export function numberToDigits(num: number): string {
  if (num < 10) return `single ${ONES[num]}`;
  const d1 = Math.floor(num / 10);
  const d2 = num % 10;
  return `${ONES[d1]} ${ONES[d2]}`;
}

export function formatAnnouncement(num: number): string {
  const words = numberToWords(num);
  const digits = numberToDigits(num);
  // e.g. "Forty two, four two" or "Seven, single seven"
  return `${words}, ${digits}`;
}

// iOS Safari Speech Synthesis Unlocker
let isAudioUnlocked = false;

export function unlockSpeechOnIOS(): void {
  if (isAudioUnlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  try {
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0.01;
    silent.rate = 1.0;
    window.speechSynthesis.speak(silent);
    isAudioUnlocked = true;
  } catch {
    // Ignore unlock issues
  }
}

/**
 * Announces the called number using Web Speech API if voice is enabled.
 */
export function announceNumber(num: number, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const text = formatAnnouncement(num);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Pick a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => (v.lang === 'en-US' || v.lang.startsWith('en')) && !v.name.includes('Google'));
    if (enVoice) {
      utterance.voice = enVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis unavailable or blocked:', err);
  }
}

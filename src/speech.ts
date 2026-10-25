/**
 * Web Speech API Synthesizer with iOS Safari WebKit unlocking.
 * Speaks each called number only once in standard plain English (e.g. "Sixty seven", "Fifty seven").
 * Completely removes individual digits, traditional nicknames, rhymes, and duplicate number calls.
 */

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five',
  'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

/**
 * Converts a number (1-90) into standard plain English words.
 * E.g. 7 -> "Seven", 57 -> "Fifty seven", 67 -> "Sixty seven", 90 -> "Ninety"
 */
export function numberToWords(num: number): string {
  if (num < 1 || num > 90) return String(num);
  if (num < 20) return ONES[num];
  const t = Math.floor(num / 10);
  const o = num % 10;
  return o > 0 ? `${TENS[t]} ${ONES[o].toLowerCase()}` : TENS[t];
}

/**
 * Formats the announcement text for display and speech.
 * Strictly outputs the number name in plain English with no extra phrases, digits, or commentary.
 */
export function formatAnnouncement(num: number): string {
  return numberToWords(num);
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

// Track last announced number and timestamp to guarantee single announcement per call
let lastSpokenNumber: number | null = null;
let lastSpokenTimestamp = 0;

/**
 * Announces the called number using Web Speech API if voice is enabled.
 * Speaks the number exactly once in plain English.
 * Guards against duplicate triggers from multi-listener Firestore snapshot updates.
 */
export function announceNumber(num: number, enabled: boolean, force = false): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  const now = Date.now();
  // Prevent duplicate announcements of the exact same number within 2000ms unless manually requested via Repeat button
  if (!force && lastSpokenNumber === num && now - lastSpokenTimestamp < 2000) {
    return;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    lastSpokenNumber = num;
    lastSpokenTimestamp = now;

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

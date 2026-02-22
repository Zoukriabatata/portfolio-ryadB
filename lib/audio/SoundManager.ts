/**
 * Sound Manager - Web Audio API based sound effects
 *
 * Generates sounds programmatically (no external files needed).
 * Respects the soundEnabled preference from useAccountPrefsStore.
 */

class SoundManagerClass {
  private ctx: AudioContext | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded = false;
  private onVoicesChanged: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.voices = window.speechSynthesis.getVoices();
      if (this.voices.length > 0) this.voicesLoaded = true;
      this.onVoicesChanged = () => {
        this.voices = window.speechSynthesis.getVoices();
        this.voicesLoaded = true;
      };
      window.speechSynthesis.addEventListener('voiceschanged', this.onVoicesChanged);
    }
  }

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Silently fail if audio context isn't available
    }
  }

  /** Close AudioContext and clean up listeners */
  destroy() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    if (this.onVoicesChanged && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.removeEventListener('voiceschanged', this.onVoicesChanged);
      this.onVoicesChanged = null;
    }
  }

  /** Short rising tone for buy order filled */
  playBuyFilled() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523, now); // C5
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659, now); // E5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.25);
      osc2.stop(now + 0.3);
    } catch {
      // Silently fail if audio context isn't available
    }
  }

  /** Short falling tone for sell order filled */
  playSellFilled() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659, now); // E5
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523, now); // C5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.25);
      osc2.stop(now + 0.3);
    } catch {
      // Silently fail if audio context isn't available
    }
  }

  /** Double beep for price alert */
  playAlert() {
    this.playTone(880, 0.12, 'square', 0.08);
    setTimeout(() => this.playTone(880, 0.12, 'square', 0.08), 180);
  }

  /** Soft chime for notification */
  playNotification() {
    this.playTone(1047, 0.3, 'sine', 0.06);
    setTimeout(() => this.playTone(1319, 0.4, 'sine', 0.04), 150);
  }

  /** Error sound */
  playError() {
    this.playTone(220, 0.25, 'sawtooth', 0.06);
  }

  /** Play a voice alert using Web Speech API */
  playVoiceAlert(side: 'buy' | 'sell', voiceType: 'male' | 'female' | 'senzoukria') {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      // Cancel any in-progress speech
      window.speechSynthesis.cancel();

      const text = voiceType === 'senzoukria' ? 'SENZOUUUUU!' : 'Order filled';
      const utterance = new SpeechSynthesisUtterance(text);

      if (voiceType === 'senzoukria') {
        utterance.pitch = 1.3;
        utterance.rate = 1.1;
      } else if (voiceType === 'male') {
        utterance.pitch = 0.3;
        utterance.rate = 1.2;
      } else {
        utterance.pitch = 1.8;
        utterance.rate = 1.15;
      }

      utterance.volume = 0.85;
      utterance.lang = voiceType === 'senzoukria' ? 'ja-JP' : 'en-US';

      // Try to pick a voice matching the type
      const voices = this.voicesLoaded ? this.voices : window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        if (voiceType === 'senzoukria') {
          // Senku: prefer a Japanese male voice for the anime feel
          const jpVoice = voices.find(v => v.lang.startsWith('ja') && /male|haruka|ichiro|otoya|takumi/i.test(v.name))
            || voices.find(v => v.lang.startsWith('ja'));
          if (jpVoice) {
            utterance.voice = jpVoice;
            utterance.lang = jpVoice.lang;
          }
        } else {
          const preferred = voices.find(v =>
            v.lang.startsWith('en') &&
            (voiceType === 'female'
              ? /female|zira|samantha|victoria|karen|jenny|hazel|susan|linda|catherine/i.test(v.name)
              : /male|david|daniel|james|mark|guy|roger|george|richard|sean/i.test(v.name))
          );
          if (preferred) {
            utterance.voice = preferred;
          } else {
            const englishVoices = voices.filter(v => v.lang.startsWith('en'));
            if (englishVoices.length > 1) {
              utterance.voice = voiceType === 'male' ? englishVoices[0] : englishVoices[englishVoices.length - 1];
            } else if (englishVoices.length === 1) {
              utterance.voice = englishVoices[0];
            }
          }
        }
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      // Silently fail if speech synthesis is not available
    }
  }
}

// Singleton
let instance: SoundManagerClass | null = null;

export function getSoundManager(): SoundManagerClass {
  if (!instance) {
    instance = new SoundManagerClass();
  }
  return instance;
}

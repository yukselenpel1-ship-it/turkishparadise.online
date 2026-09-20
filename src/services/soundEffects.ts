// High-quality, mobile-optimized Web Audio API Sound Effects Manager for Turkish Paradise

const SOUND_STORAGE_KEY = 'tp_sound_enabled';

class SoundEffectsService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private isUnlocked: boolean = false;
  private listeners: Set<(enabled: boolean) => void> = new Set();

  constructor() {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(SOUND_STORAGE_KEY);
        if (stored !== null) {
          this.soundEnabled = stored === 'true';
        }
        // Automatically attach user gesture unlock listeners for Mobile (iOS & Android)
        this.setupMobileAudioUnlock();
      }
    } catch (e) {
      this.soundEnabled = true;
    }
  }

  /**
   * Mobile Browsers (iOS Safari, Android Chrome) block Web Audio API until an explicit user tap/click.
   * This method attaches event listeners to the first user gesture to unlock AudioContext permanently.
   */
  public setupMobileAudioUnlock() {
    if (typeof window === 'undefined' || this.isUnlocked) return;

    const unlock = () => {
      try {
        const ctx = this.getContext();
        if (ctx) {
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          // Play silent buffer source to unlock iOS Web Audio engine
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
          this.isUnlocked = true;
        }
      } catch (e) {}

      // Clean up listeners after first successful gesture
      if (typeof window !== 'undefined') {
        window.removeEventListener('touchstart', unlock, true);
        window.removeEventListener('touchend', unlock, true);
        window.removeEventListener('click', unlock, true);
        window.removeEventListener('pointerdown', unlock, true);
      }
    };

    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('touchend', unlock, { capture: true, passive: true });
    window.addEventListener('click', unlock, { capture: true, passive: true });
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
      }
    } catch (e) {}
    this.notifyListeners();
    if (enabled) {
      this.playTurnAlert(true); // Short soft feedback tone on enable
    }
  }

  public toggle(): boolean {
    const newState = !this.soundEnabled;
    this.setEnabled(newState);
    return newState;
  }

  public subscribe(listener: (enabled: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn(this.soundEnabled));
  }

  // 1. Soft Alert Tone when it becomes YOUR TURN (Gentle 2-tone melodic chime)
  public playTurnAlert(force = false) {
    if (!this.soundEnabled && !force) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.25, now);
      masterGain.connect(ctx.destination);

      // Note 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.01, now);
      gain1.gain.exponentialRampToValueAtTime(0.25, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.36);

      // Note 2: B5 (987.77 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.12);
      gain2.gain.setValueAtTime(0.01, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.28, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.62);
    } catch (e) {
      console.warn('[Sound] Play turn alert warning:', e);
    }
  }

  // 2. Soft Dice Rolling Rattle Sound
  public playDiceRoll() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const time = now + i * 0.05 + Math.random() * 0.02;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200 + Math.random() * 140, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.04);

        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.05);
      }
    } catch (e) {}
  }

  // 3. Subtle Step Movement Sound (Soft Pop/Tick)
  public playStep() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.04);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {}
  }

  // 4. Buy Property / Money Cash Chime
  public playBuyProperty() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.2, now);
      masterGain.connect(ctx.destination);

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.01, startTime);
        gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.42);
      });
    } catch (e) {}
  }

  // 5. Chance Card Shimmer Sound
  public playChanceCard() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.18, now);
      masterGain.connect(ctx.destination);

      const arpeggio = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6
      arpeggio.forEach((freq, idx) => {
        const startTime = now + idx * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.01, startTime);
        gain.gain.exponentialRampToValueAtTime(0.22, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.52);
      });
    } catch (e) {}
  }

  // 6. Jail / Kodes Alert Sound
  public playJail() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(146.83, now + 0.3);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    } catch (e) {}
  }

  // 7. Incoming Trade Offer Notification
  public playTradeOffer() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.22, now);
      masterGain.connect(ctx.destination);

      [880, 1174.66].forEach((freq, idx) => {
        const startTime = now + idx * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.01, startTime);
        gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.48);
      });
    } catch (e) {}
  }

  // 8. Victory Fanfare Sound
  public playWin() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.25, now);
      masterGain.connect(ctx.destination);

      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.01, startTime);
        gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.7);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.75);
      });
    } catch (e) {}
  }
}

export const soundManager = new SoundEffectsService();

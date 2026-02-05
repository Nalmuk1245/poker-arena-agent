import { useRef, useState, useCallback, useEffect } from 'react';

export type SoundType = 'cardDeal' | 'chipBet' | 'fold' | 'allIn' | 'win' | 'lose' | 'turnAlert';

class SoundManager {
  private context: AudioContext | null = null;
  private volume: number = 0.5;
  private muted: boolean = false;

  constructor() {
    // Load persisted settings
    const savedVolume = localStorage.getItem('poker-volume');
    const savedMuted = localStorage.getItem('poker-muted');

    if (savedVolume !== null) {
      this.volume = parseFloat(savedVolume);
    }
    if (savedMuted !== null) {
      this.muted = savedMuted === 'true';
    }
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.context;
  }

  private createOscillator(
    frequency: number,
    type: OscillatorType = 'sine',
    startTime: number = 0,
    duration: number = 0.1
  ): { osc: OscillatorNode; gain: GainNode } {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    return { osc, gain };
  }

  private applyEnvelope(
    gain: GainNode,
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    startTime: number = 0
  ): void {
    const ctx = this.getContext();
    const now = ctx.currentTime + startTime;
    const volume = this.muted ? 0 : this.volume;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.linearRampToValueAtTime(sustain * volume, now + attack + decay);
    gain.gain.linearRampToValueAtTime(0, now + attack + decay + release);
  }

  cardDeal(): void {
    const ctx = this.getContext();
    const { osc, gain } = this.createOscillator(1200, 'square', 0, 0.05);

    this.applyEnvelope(gain, 0.001, 0.01, 0.3, 0.04, 0);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }

  chipBet(): void {
    const ctx = this.getContext();
    const { osc, gain } = this.createOscillator(800, 'sine', 0, 0.08);

    // Add harmonic for "clink" effect
    const { osc: osc2, gain: gain2 } = this.createOscillator(1600, 'sine', 0, 0.08);

    this.applyEnvelope(gain, 0.001, 0.02, 0.2, 0.06, 0);
    this.applyEnvelope(gain2, 0.001, 0.015, 0.1, 0.065, 0);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + 0.08);
  }

  fold(): void {
    const ctx = this.getContext();
    const { osc, gain } = this.createOscillator(150, 'triangle', 0, 0.1);

    this.applyEnvelope(gain, 0.005, 0.03, 0.4, 0.065, 0);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  allIn(): void {
    const ctx = this.getContext();
    const { osc, gain } = this.createOscillator(300, 'sawtooth', 0, 0.3);

    // Rising sweep
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.3);

    this.applyEnvelope(gain, 0.01, 0.05, 0.7, 0.24, 0);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  win(): void {
    const ctx = this.getContext();

    // Ascending chord: C5, E5, G5
    const freqs = [523.25, 659.25, 783.99];

    freqs.forEach((freq, i) => {
      const { osc, gain } = this.createOscillator(freq, 'sine', i * 0.08, 0.32);
      this.applyEnvelope(gain, 0.01, 0.05, 0.6, 0.26, i * 0.08);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.32);
    });
  }

  lose(): void {
    const ctx = this.getContext();
    const { osc, gain } = this.createOscillator(400, 'sine', 0, 0.3);

    // Descending tone
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);

    this.applyEnvelope(gain, 0.02, 0.05, 0.5, 0.23, 0);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  turnAlert(): void {
    const ctx = this.getContext();

    // Two-tone ping
    const { osc: osc1, gain: gain1 } = this.createOscillator(800, 'sine', 0, 0.1);
    const { osc: osc2, gain: gain2 } = this.createOscillator(1000, 'sine', 0.1, 0.1);

    this.applyEnvelope(gain1, 0.005, 0.02, 0.3, 0.075, 0);
    this.applyEnvelope(gain2, 0.005, 0.02, 0.3, 0.075, 0.1);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.1);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.2);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('poker-volume', this.volume.toString());
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem('poker-muted', muted.toString());
  }

  isMuted(): boolean {
    return this.muted;
  }

  playSound(type: SoundType): void {
    try {
      switch (type) {
        case 'cardDeal':
          this.cardDeal();
          break;
        case 'chipBet':
          this.chipBet();
          break;
        case 'fold':
          this.fold();
          break;
        case 'allIn':
          this.allIn();
          break;
        case 'win':
          this.win();
          break;
        case 'lose':
          this.lose();
          break;
        case 'turnAlert':
          this.turnAlert();
          break;
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }
}

export function useSoundManager() {
  const managerRef = useRef<SoundManager | null>(null);
  const [volume, setVolumeState] = useState(0.5);
  const [muted, setMutedState] = useState(false);

  // Initialize manager
  if (!managerRef.current) {
    managerRef.current = new SoundManager();
    setVolumeState(managerRef.current.getVolume());
    setMutedState(managerRef.current.isMuted());
  }

  const playSound = useCallback((type: SoundType) => {
    managerRef.current?.playSound(type);
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    managerRef.current?.setVolume(newVolume);
    setVolumeState(newVolume);
  }, []);

  const setMuted = useCallback((newMuted: boolean) => {
    managerRef.current?.setMuted(newMuted);
    setMutedState(newMuted);
  }, []);

  return {
    playSound,
    volume,
    setVolume,
    muted,
    setMuted,
  };
}

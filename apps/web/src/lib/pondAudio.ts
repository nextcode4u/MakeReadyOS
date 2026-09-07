export type PondSound = "frog" | "bubble" | "catch" | "splash" | "visitor" | "ready" | "rain";

// Short, synthesized cues only: no looping audio or external audio downloads.
const notes: Record<PondSound, number[]> = {
  frog: [170, 135], bubble: [620], catch: [310, 190],
  splash: [430, 310, 520], visitor: [660, 880, 990],
  ready: [523, 659, 784, 1047], rain: [1100, 740, 930],
};

export class PondAudio {
  private context = new AudioContext();
  private output = this.context.createGain();
  private lastCue = -Infinity;
  private revision = 0;

  constructor() {
    this.output.gain.value = 0;
    this.output.connect(this.context.destination);
  }

  async resume(volume: number) {
    const revision = ++this.revision;
    await this.context.resume();
    if (revision === this.revision) this.setVolume(volume);
  }

  setVolume(volume: number) {
    this.output.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.context.currentTime);
  }

  pause() {
    this.revision++;
    this.setVolume(0);
    return this.context.suspend();
  }

  close() { this.revision++; return this.context.close(); }

  play(cue: PondSound) {
    if (this.context.state !== "running") return;
    const now = this.context.currentTime;
    // A busy pond should not produce a chorus of overlapping catch sounds.
    if (now - this.lastCue < .7) return;
    this.lastCue = now;
    notes[cue].forEach((frequency, index) => {
      const start = now + index * .1;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = cue === "frog" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * (cue === "ready" || cue === "visitor" ? .95 : .5), start + .14);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(cue === "rain" ? .018 : .055, start + .01);
      gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain);
      gain.connect(this.output);
      oscillator.start(start);
      oscillator.stop(start + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
}

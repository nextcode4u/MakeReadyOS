export type PondSound = "frog" | "bubble" | "catch" | "splash" | "visitor" | "ready" | "rain" | "crystal-low" | "crystal-middle" | "crystal-high";

// Short, synthesized cues only: no looping audio or external audio downloads.
type PondNote = { frequency: number; end: number; delay: number; duration: number; gain: number; wave: OscillatorType; warble?: boolean };
export function pondSoundNotes(cue: PondSound): PondNote[] {
  if (cue === "crystal-low" || cue === "crystal-middle" || cue === "crystal-high") {
    const frequency = { "crystal-low": 523, "crystal-middle": 659, "crystal-high": 784 }[cue];
    return [{ frequency, end: frequency, delay: 0, duration: .35, gain: .16, wave: "sine" }];
  }
  if (cue === "frog") return [
    { frequency: 230, end: 135, delay: 0, duration: .25, gain: .11, wave: "square", warble: true },
    { frequency: 185, end: 105, delay: .29, duration: .19, gain: .095, wave: "square", warble: true },
  ];
  if (cue === "catch") return [
    { frequency: 560, end: 145, delay: 0, duration: .055, gain: .25, wave: "triangle" },
    { frequency: 390, end: 110, delay: .1, duration: .065, gain: .22, wave: "triangle" },
    { frequency: 1200, end: 450, delay: .025, duration: .025, gain: .045, wave: "sawtooth" },
  ];
  const pitches = { bubble: [620], splash: [430, 310, 520], visitor: [660, 880, 990], ready: [523, 659, 784, 1047], rain: [1100, 740, 930] }[cue];
  return pitches.map((frequency, index) => ({ frequency, end: frequency * (cue === "ready" || cue === "visitor" ? .95 : .5), delay: index * .1, duration: .18, gain: cue === "rain" ? .045 : .16, wave: "sine" }));
}

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
    if (now - this.lastCue < (cue.startsWith("crystal-") ? .12 : .7)) return;
    this.lastCue = now;
    pondSoundNotes(cue).forEach(note => {
      const start = now + note.delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = note.wave;
      oscillator.frequency.setValueAtTime(note.frequency, start);
      if (note.warble) {
        for (let step = 1; step < 8; step++) {
          const pitch = note.frequency + (note.end - note.frequency) * step / 8;
          oscillator.frequency.linearRampToValueAtTime(pitch * (step % 2 ? 1.18 : .82), start + note.duration * step / 8);
        }
      }
      oscillator.frequency.exponentialRampToValueAtTime(note.end, start + note.duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.gain, start + .005);
      gain.gain.exponentialRampToValueAtTime(.001, start + note.duration);
      oscillator.connect(gain);
      gain.connect(this.output);
      oscillator.start(start);
      oscillator.stop(start + note.duration + .01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
}

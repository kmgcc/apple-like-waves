import { BandLayout } from "./band-layout.js";
import { TuningProfile } from "./tuning.js";

/**
 * Per-band spectrum state machine managing dynamic range, reference envelope, and attack boost.
 */
export class SpectrumChain {
  public readonly bandCount: number;
  public readonly layout: BandLayout;
  public gain: number[];
  public exponent: number[];
  public punch: number[];

  private history: [number[], number[], number[]];
  private slow: number[];
  public readonly output: number[];

  constructor(bandCount: number, layout: BandLayout, profile: TuningProfile) {
    this.bandCount = bandCount;
    this.layout = layout;
    const centres = layout.centres;
    this.gain = centres.map((f) =>
      BandLayout.smoothCal(profile.gains, f, profile.baseEdges)
    );
    this.exponent = centres.map((f) =>
      BandLayout.smoothCal(profile.exponents, f, profile.baseEdges)
    );
    this.punch = centres.map((f) =>
      BandLayout.smoothCal(profile.punch, f, profile.baseEdges)
    );

    const n = Math.max(1, layout.count);
    this.history = [
      new Array(n).fill(0.0),
      new Array(n).fill(0.0),
      new Array(n).fill(0.0),
    ];
    this.slow = new Array(n).fill(0.0);
    this.output = new Array(n).fill(0.0);
  }

  public updateProfile(profile: TuningProfile): void {
    const centres = this.layout.centres;
    this.gain = centres.map((f) =>
      BandLayout.smoothCal(profile.gains, f, profile.baseEdges)
    );
    this.exponent = centres.map((f) =>
      BandLayout.smoothCal(profile.exponents, f, profile.baseEdges)
    );
    this.punch = centres.map((f) =>
      BandLayout.smoothCal(profile.punch, f, profile.baseEdges)
    );
  }

  /**
   * Consumes one tick of band energy accumulators and advances the chain by dt seconds.
   */
  public step(
    acc: readonly number[],
    dt: number,
    reactivity: number,
    noiseGateScale: number,
    profile: TuningProfile
  ): number[] {
    const n = this.output.length;
    if (n === 0) return [];

    // 1. Per-band dynamic range normalization
    const value: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const energy = i < acc.length ? acc[i] : 0.0;
      const raw = energy * this.gain[i];
      value[i] = Math.min(1.0, Math.max(0.0, Math.pow(Math.max(0.0, raw), this.exponent[i])));
    }

    // 2. Slow envelope tracking for quiet section detection
    const stepDt = Math.max(0.001, Math.min(0.2, dt));
    const alpha = 1.0 - Math.exp(-stepDt / Math.max(1e-6, profile.slowTau));
    for (let i = 0; i < n; i++) {
      this.slow[i] += (value[i] - this.slow[i]) * alpha;
    }

    // 3. Attack boost against 3-tap reference envelope
    const smoothed: number[] = new Array(n).fill(0.0);
    for (let k = 0; k < profile.referenceKernel.length; k++) {
      const weight = profile.referenceKernel[k];
      const src = this.history[Math.min(k, 2)];
      for (let i = 0; i < n; i++) {
        smoothed[i] += weight * src[i];
      }
    }

    const low = profile.deadbandLow * Math.max(0.0, noiseGateScale);
    const high = profile.deadbandHigh * Math.max(0.0, noiseGateScale);

    for (let i = 0; i < n; i++) {
      const rise = Math.max(0.0, value[i] - smoothed[i]);
      const gate = Math.min(1.0, Math.max(0.0, 1.0 - this.slow[i] / Math.max(1e-6, profile.gateLow)));
      const amount = (this.punch[i] * gate + profile.punchBase) * Math.max(0.0, reactivity);
      const shape = high > low ? Math.min(1.0, Math.max(0.0, (rise - low) / (high - low))) : 1.0;
      this.output[i] = Math.fround(Math.min(1.0, Math.max(0.0, value[i] + amount * rise * shape)));
    }

    // 4. History rotation (newest first)
    this.history[2] = [...this.history[1]];
    this.history[1] = [...this.history[0]];
    this.history[0] = [...value];

    return this.output;
  }

  public reset(): void {
    const n = this.output.length;
    this.history = [
      new Array(n).fill(0.0),
      new Array(n).fill(0.0),
      new Array(n).fill(0.0),
    ];
    this.slow = new Array(n).fill(0.0);
    this.output.fill(0.0);
  }
}

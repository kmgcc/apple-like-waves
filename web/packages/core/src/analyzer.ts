import { BandLayout } from "./band-layout.js";
import { RealFFT } from "./fft.js";
import { RingBuffer } from "./ring-buffer.js";
import { SpectrumChain } from "./spectrum-chain.js";
import { DEFAULT_TUNING_PROFILE, TuningProfile } from "./tuning.js";

export interface SpectrumAnalyzerOptions {
  bandCount?: number;
  sampleRate?: number;
  tuningProfile?: TuningProfile;
  reactivity?: number;
  noiseGateScale?: number;
  inputGain?: number;
}

/**
 * High-level spectrum analyzer providing symmetrical push / step audio visualization DSP.
 */
export class SpectrumAnalyzer {
  public readonly bandCount: number;
  public readonly sampleRate: number;
  public readonly windowSize = 2048;

  public reactivity: number;
  public noiseGateScale: number;
  public inputGain: number;
  public tuningProfile: TuningProfile;

  private readonly ringBuffer: RingBuffer;
  private readonly fft: RealFFT;
  private readonly layout: BandLayout;
  private readonly baseLayout: BandLayout;
  private readonly chain: SpectrumChain;
  private readonly windowBuf: Float32Array;

  constructor(options: SpectrumAnalyzerOptions = {}) {
    const bandCount = Math.max(1, options.bandCount ?? 6);
    const sampleRate = Math.max(1.0, options.sampleRate ?? 48000.0);
    const tuningProfile = options.tuningProfile ?? DEFAULT_TUNING_PROFILE;

    this.bandCount = bandCount;
    this.sampleRate = sampleRate;
    this.tuningProfile = tuningProfile;
    this.reactivity = Math.max(0.0, options.reactivity ?? 1.0);
    this.noiseGateScale = Math.max(0.0, options.noiseGateScale ?? 1.0);
    this.inputGain = Math.max(0.0, options.inputGain ?? 1.0);

    this.ringBuffer = new RingBuffer(2048);
    this.fft = new RealFFT(2048);
    this.windowBuf = new Float32Array(2048);

    const binWidth = this.sampleRate / 2048.0;
    this.baseLayout = new BandLayout(
      Array.from(tuningProfile.baseEdges),
      Array.from({ length: Math.max(0, tuningProfile.baseEdges.length - 1) }, (_, i) => i),
      binWidth
    );

    this.layout = BandLayout.make(
      bandCount,
      binWidth,
      tuningProfile.baseEdges,
      tuningProfile.multiBandLowEdge
    );

    this.chain = new SpectrumChain(bandCount, this.layout, tuningProfile);
  }

  /**
   * Pushes new mono PCM samples into the circular buffer.
   */
  public pushSamples(pcm: Float32Array | number[]): void {
    this.ringBuffer.push(pcm);
  }

  /**
   * Analyzes current buffer and advances dynamic simulation by `dt` seconds.
   * Returns normalized band values in [0, 1].
   */
  public step(dt: number): number[] {
    this.ringBuffer.getLatest(this.windowBuf);
    const mags = this.fft.computeMagnitudes(this.windowBuf);

    if (mags.length === 0) {
      return this.chain.step(
        new Array(this.bandCount).fill(0.0),
        dt,
        this.reactivity,
        this.noiseGateScale,
        this.tuningProfile
      );
    }

    const binWidth = this.sampleRate / 2048.0;

    // Coarse 6-band baseline calculation
    const baseMags = RealFFT.bands(mags, binWidth, this.baseLayout, false);
    const coarse: number[] = new Array(Math.min(6, baseMags.length));
    for (let i = 0; i < coarse.length; i++) {
      coarse[i] = baseMags[i] / this.tuningProfile.windowCalibration[i];
    }

    let acc: number[];
    if (this.bandCount <= 6) {
      acc = coarse;
    } else {
      const rows = RealFFT.bands(mags, binWidth, this.layout, true);
      const weights = this.layout.densityScale;
      acc = new Array(this.layout.count).fill(0.0);
      for (let i = 0; i < this.layout.count; i++) {
        const p = Math.min(Math.max(this.layout.parent[i], 0), 5);
        const scale = this.tuningProfile.windowCalibration[p];
        if (this.layout.isWholeParentBand(i, this.tuningProfile.baseEdges)) {
          acc[i] = coarse[p];
        } else {
          acc[i] = (rows[i] * weights[i]) / scale * this.tuningProfile.subBandTrim;
        }
      }
    }

    if (this.inputGain !== 1.0) {
      const g = Math.max(0.0, this.inputGain);
      for (let i = 0; i < acc.length; i++) {
        acc[i] *= g;
      }
    }

    return this.chain.step(
      acc,
      dt,
      this.reactivity,
      this.noiseGateScale,
      this.tuningProfile
    );
  }

  /**
   * Resets internal ring buffer, envelope states, and history.
   */
  public reset(): void {
    this.ringBuffer.reset();
    this.chain.reset();
  }

  /**
   * UI layout helper: calculates recommended band count for a given display width.
   * Follows baseline 6 bars with +1 bar per 28 pt of additional width beyond 168 pt.
   */
  public static recommendedBandCount(
    width: number,
    baseline = 6,
    baseWidth = 168.0,
    step = 28.0
  ): number {
    if (width <= baseWidth || step <= 0) return baseline;
    const extra = Math.floor((width - baseWidth) / step);
    return baseline + Math.max(0, extra);
  }
}

/**
 * Creates a new SpectrumAnalyzer instance.
 */
export function createSpectrumAnalyzer(
  options?: SpectrumAnalyzerOptions
): SpectrumAnalyzer {
  return new SpectrumAnalyzer(options);
}

/**
 * UI layout helper: calculates recommended band count for a given display width.
 */
export function recommendedBandCount(
  width: number,
  baseline = 6,
  baseWidth = 168.0,
  step = 28.0
): number {
  return SpectrumAnalyzer.recommendedBandCount(width, baseline, baseWidth, step);
}

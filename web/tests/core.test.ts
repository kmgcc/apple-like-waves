import { describe, it, expect } from "vitest";
import {
  DEFAULT_TUNING_PROFILE,
  BandLayout,
  RingBuffer,
  RealFFT,
  SpectrumAnalyzer,
  createSpectrumAnalyzer,
  recommendedBandCount,
} from "@alwave/core";

describe("TuningProfile", () => {
  it("has valid default parameters matching canonical spec", () => {
    expect(DEFAULT_TUNING_PROFILE.baseEdges.length).toBe(7);
    expect(DEFAULT_TUNING_PROFILE.gains.length).toBe(6);
    expect(DEFAULT_TUNING_PROFILE.exponents.length).toBe(6);
    expect(DEFAULT_TUNING_PROFILE.punch.length).toBe(6);
    expect(DEFAULT_TUNING_PROFILE.referenceKernel.length).toBe(3);
    expect(DEFAULT_TUNING_PROFILE.windowCalibration.length).toBe(6);
    expect(DEFAULT_TUNING_PROFILE.spring.duration).toBeCloseTo(0.325, 6);
    expect(DEFAULT_TUNING_PROFILE.spring.damping).toBeCloseTo(0.83, 6);
  });
});

describe("BandLayout", () => {
  it("generates 6 bands matching base edges", () => {
    const binWidth = 48000.0 / 2048.0;
    const layout6 = BandLayout.make(6, binWidth);
    expect(layout6.count).toBe(6);
    expect(layout6.edges).toEqual(Array.from(DEFAULT_TUNING_PROFILE.baseEdges));
  });

  it("generates 36 dynamic octave bands correctly", () => {
    const binWidth = 48000.0 / 2048.0;
    const layout36 = BandLayout.make(36, binWidth);
    expect(layout36.count).toBe(36);
    expect(layout36.edges[0]).toBeGreaterThanOrEqual(39.0);
    expect(layout36.edges[36]).toBeCloseTo(10000.0, 3);

    for (let i = 0; i < 36; i++) {
      expect(layout36.widths[i]).toBeGreaterThan(0);
      expect(layout36.densityScale[i]).toBeGreaterThan(0);
    }
  });
});

describe("RingBuffer", () => {
  it("buffers samples and snapshots correctly", () => {
    const buf = new RingBuffer(8);
    buf.push([1.0, 2.0, 3.0]);

    const snap1 = new Float32Array(8);
    buf.getLatest(snap1);
    expect(Array.from(snap1)).toEqual([0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0]);

    buf.push([4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    const snap2 = new Float32Array(8);
    buf.getLatest(snap2);
    expect(Array.from(snap2)).toEqual([2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);

    buf.reset();
    const snap3 = new Float32Array(8);
    buf.getLatest(snap3);
    expect(Array.from(snap3)).toEqual([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
  });
});

describe("RealFFT", () => {
  it("matches Accelerate vDSP peak bin and amplitude for pure sine wave", () => {
    const fft = new RealFFT(2048);
    const sampleRate = 48000.0;
    const freq = 1171.875; // bin 50: 50 * (48000 / 2048)
    const samples = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      samples[i] = Math.sin((2.0 * Math.PI * freq * i) / sampleRate);
    }

    const mags = fft.computeMagnitudes(samples);
    expect(mags.length).toBe(1024);

    let maxBin = 0;
    let maxMag = 0.0;
    for (let i = 0; i < mags.length; i++) {
      if (mags[i] > maxMag) {
        maxMag = mags[i];
        maxBin = i;
      }
    }

    expect(maxBin).toBe(50);
    expect(maxMag).toBeCloseTo(1.0, 1);
  });
});

describe("recommendedBandCount", () => {
  it("calculates layout bands based on width", () => {
    expect(recommendedBandCount(100)).toBe(6);
    expect(recommendedBandCount(168)).toBe(6);
    expect(recommendedBandCount(196)).toBe(7);
    expect(recommendedBandCount(224)).toBe(8);
    expect(SpectrumAnalyzer.recommendedBandCount(252)).toBe(9);
  });
});

import { BandLayout } from "./band-layout.js";

/**
 * Real-valued Fast Fourier Transform analyzer matching Apple Accelerate vDSP scaling and precision.
 */
export class RealFFT {
  public readonly fftSize: number;
  public readonly halfSize: number;
  private readonly window: Float32Array;
  private readonly bitRev: Int32Array;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly real: Float32Array;
  private readonly imag: Float32Array;
  private readonly mags: Float32Array;
  private readonly magScale: number;

  constructor(fftSize = 2048) {
    if (fftSize < 2 || (fftSize & (fftSize - 1)) !== 0) {
      throw new Error(`fftSize must be a power of 2 >= 2, got ${fftSize}`);
    }
    this.fftSize = fftSize;
    this.halfSize = fftSize / 2;
    this.magScale = Math.fround(1.0 / this.halfSize);

    this.window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      this.window[i] = Math.fround(0.5 - 0.5 * Math.cos((2.0 * Math.PI * i) / fftSize));
    }

    const bits = Math.round(Math.log2(fftSize));
    this.bitRev = new Int32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      let rev = 0;
      for (let b = 0; b < bits; b++) {
        rev = (rev << 1) | ((i >> b) & 1);
      }
      this.bitRev[i] = rev;
    }

    this.cosTable = new Float32Array(fftSize);
    this.sinTable = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const angle = (-2.0 * Math.PI * i) / fftSize;
      this.cosTable[i] = Math.fround(Math.cos(angle));
      this.sinTable[i] = Math.fround(Math.sin(angle));
    }

    this.real = new Float32Array(fftSize);
    this.imag = new Float32Array(fftSize);
    this.mags = new Float32Array(this.halfSize);
  }

  /**
   * Computes Hann-windowed magnitude spectrum for `fftSize` input samples.
   * Strictly aligned with Apple Accelerate vDSP outputs.
   */
  public computeMagnitudes(samples: Float32Array | number[]): Float32Array {
    if (samples.length < this.fftSize) {
      return new Float32Array(0);
    }

    const n = this.fftSize;
    const real = this.real;
    const imag = this.imag;
    const win = this.window;
    const bitRev = this.bitRev;
    const cosTable = this.cosTable;
    const sinTable = this.sinTable;

    // Apply Hann window and bit-reversal permutation (Float32 precision aligned with vDSP_vmul)
    for (let i = 0; i < n; i++) {
      const j = bitRev[i];
      real[j] = Math.fround(samples[i] * win[i]);
      imag[j] = 0.0;
    }

    // Cooley-Tukey Radix-2 DIT FFT
    for (let m = 2; m <= n; m <<= 1) {
      const m2 = m >> 1;
      const step = n / m;
      for (let j = 0; j < m2; j++) {
        const k = j * step;
        const wr = cosTable[k];
        const wi = sinTable[k];

        for (let i = j; i < n; i += m) {
          const idx2 = i + m2;
          const tr = Math.fround(Math.fround(wr * real[idx2]) - Math.fround(wi * imag[idx2]));
          const ti = Math.fround(Math.fround(wr * imag[idx2]) + Math.fround(wi * real[idx2]));

          real[idx2] = Math.fround(real[i] - tr);
          imag[idx2] = Math.fround(imag[i] - ti);
          real[i] = Math.fround(real[i] + tr);
          imag[i] = Math.fround(imag[i] + ti);
        }
      }
    }

    // Convert to vDSP magnitude scaling:
    // vDSP packed real forward FFT produces 2 * |DFT|.
    // zvabs computes sqrt(Re^2 + Im^2), then multiplied by magScale = 1.0 / halfSize.
    const half = this.halfSize;
    const scale = this.magScale;

    // DC (k=0) and Nyquist (k=N/2) matching vDSP_zvabs packed behavior
    const dcNyquist = Math.fround(2.0 * Math.fround(Math.hypot(real[0], real[half])));
    this.mags[0] = Math.fround(dcNyquist * scale);

    for (let k = 1; k < half; k++) {
      const mag = Math.fround(2.0 * Math.fround(Math.hypot(real[k], imag[k])));
      this.mags[k] = Math.fround(mag * scale);
    }

    return this.mags;
  }

  /**
   * Accumulates magnitude spectrum into bands according to layout, multiplied by K = 2 * sqrt(8/3).
   */
  public static bands(
    mags: Float32Array | number[],
    binWidth: number,
    layout: BandLayout,
    cleanAssignment = false
  ): number[] {
    const count = layout.count;
    if (count <= 0 || mags.length === 0) return [];
    const kFactor = 2.0 * Math.sqrt(8.0 / 3.0);
    const row: number[] = new Array(count).fill(0.0);
    let band = 0;

    for (let k = 0; k < mags.length; k++) {
      const f = k * binWidth;
      const m = mags[k];

      if (cleanAssignment) {
        if (f < layout.edges[0] || f >= layout.edges[count]) continue;
        while (band + 1 < count && f >= layout.edges[band + 1]) {
          band++;
        }
        row[band] += m;
        continue;
      }

      const lo = layout.edges[band];
      const hi = layout.edges[band + 1];
      if (f < lo || f > hi) {
        if (band + 1 < count && f >= hi) {
          while (band + 1 < count && f >= layout.edges[band + 1]) {
            band++;
          }
        }
        row[band] += m / (hi - lo);
      } else {
        row[band] += m;
      }
    }

    for (let b = 0; b < count; b++) {
      row[b] *= kFactor;
    }
    return row;
  }
}

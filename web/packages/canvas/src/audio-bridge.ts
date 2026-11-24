export interface AudioBridgeOptions {
  audioContext?: AudioContext;
  fftSize?: number;
}

/**
 * Web Audio API bridge for extracting real-time time-domain PCM samples.
 *
 * NOTE: Strictly uses AnalyserNode.getFloatTimeDomainData() rather than getFloatFrequencyData()
 * because CapsuleWave performs its own calibrated Radix-2 Real FFT, Hann windowing,
 * dynamic octave binning, and nonlinear compression.
 */
export class WebAudioBridge {
  public readonly audioContext: AudioContext;
  public readonly analyserNode: AnalyserNode;
  private readonly pcmBuffer: Float32Array;

  constructor(options: AudioBridgeOptions = {}) {
    const AudioCtx =
      options.audioContext ??
      (typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
        ? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        : (null as unknown as AudioContext));

    if (!AudioCtx) {
      throw new Error("Web Audio API is not supported in this environment");
    }

    this.audioContext = AudioCtx;
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = options.fftSize ?? 2048;
    this.analyserNode.smoothingTimeConstant = 0.0; // Raw audio passed directly to CapsuleWave

    this.pcmBuffer = new Float32Array(this.analyserNode.fftSize);
  }

  /**
   * Connects an audio source node to the analyser and optionally to a destination.
   */
  public connectSource(
    sourceNode: AudioNode,
    destination: AudioNode | null = this.audioContext.destination
  ): void {
    sourceNode.connect(this.analyserNode);
    if (destination) {
      this.analyserNode.connect(destination);
    }
  }

  /**
   * Reads raw mono PCM time-domain float samples into the provided or internal buffer.
   */
  public readTimeDomainSamples(target?: Float32Array): Float32Array {
    const dest = target ?? this.pcmBuffer;
    this.analyserNode.getFloatTimeDomainData(dest as any);
    return dest;
  }
}

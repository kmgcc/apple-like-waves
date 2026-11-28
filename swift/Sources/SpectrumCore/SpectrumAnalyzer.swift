import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif

/// High-level spectrum analyzer providing symmetrical push / step audio visualization DSP.
public final class SpectrumAnalyzer: @unchecked Sendable {
    public let bandCount: Int
    public let sampleRate: Double
    public let windowSize: Int = 2048

    public var reactivity: Double {
        didSet {
            reactivity = max(0.0, reactivity)
        }
    }

    public var noiseGateScale: Double {
        didSet {
            noiseGateScale = max(0.0, noiseGateScale)
        }
    }

    public var inputGain: Double {
        didSet {
            inputGain = max(0.0, inputGain)
        }
    }

    public var tuningProfile: TuningProfile {
        didSet {
            chain.updateProfile(tuningProfile)
        }
    }

    private var circularBuffer: CircularBuffer
    private let fft: RealFFT
    private let layout: BandLayout
    private let baseLayout: BandLayout
    private let chain: SpectrumChain

    public init(
        bandCount: Int = 6,
        sampleRate: Double = 48000.0,
        tuningProfile: TuningProfile = .default,
        reactivity: Double = 1.0,
        noiseGateScale: Double = 1.0,
        inputGain: Double = 1.0
    ) {
        let count = max(1, bandCount)
        self.bandCount = count
        self.sampleRate = max(1.0, sampleRate)
        self.tuningProfile = tuningProfile
        self.reactivity = max(0.0, reactivity)
        self.noiseGateScale = max(0.0, noiseGateScale)
        self.inputGain = max(0.0, inputGain)

        self.circularBuffer = CircularBuffer(capacity: 2048)
        guard let fftInstance = RealFFT(fftSize: 2048) else {
            fatalError("Failed to initialize RealFFT with size 2048")
        }
        self.fft = fftInstance

        let binWidth = self.sampleRate / 2048.0
        self.baseLayout = BandLayout(
            edges: tuningProfile.baseEdges,
            parent: Array(0..<max(0, tuningProfile.baseEdges.count - 1)),
            binWidth: binWidth
        )

        self.layout = BandLayout.make(
            count: count,
            binWidth: binWidth,
            baseEdges: tuningProfile.baseEdges,
            lowEdge: tuningProfile.multiBandLowEdge
        )

        self.chain = SpectrumChain(
            bandCount: count,
            layout: self.layout,
            profile: tuningProfile
        )
    }

    /// Pushes new mono PCM samples into the circular buffer.
    public func pushSamples(_ pcm: [Float]) {
        circularBuffer.push(pcm)
    }

    /// Symmetrical convenience overload.
    public func pushSamples(pcm: [Float]) {
        pushSamples(pcm)
    }

    /// Analyzes the current buffer and advances dynamic simulation by `dt` seconds.
    /// Returns normalized band values in [0, 1].
    public func step(dt: Double) -> [Float] {
        let window = circularBuffer.snapshot()
        let mags = fft.computeMagnitudes(samples: window)

        guard !mags.isEmpty else {
            return chain.step(
                acc: [Double](repeating: 0.0, count: bandCount),
                dt: dt,
                reactivity: reactivity,
                noiseGateScale: noiseGateScale,
                profile: tuningProfile
            )
        }

        let binWidth = sampleRate / 2048.0

        // Coarse 6-band baseline calculation
        let baseMags = RealFFT.bands(
            magnitudes: mags,
            binWidth: binWidth,
            layout: baseLayout,
            cleanAssignment: false
        )

        let coarse = (0..<min(6, baseMags.count)).map {
            baseMags[$0] / tuningProfile.windowCalibration[$0]
        }

        var acc: [Double]
        if bandCount <= 6 {
            acc = coarse
        } else {
            let rows = RealFFT.bands(
                magnitudes: mags,
                binWidth: binWidth,
                layout: layout,
                cleanAssignment: true
            )
            let weights = layout.densityScale
            acc = [Double](repeating: 0.0, count: layout.count)
            for i in 0..<layout.count {
                let p = min(max(layout.parent[i], 0), 5)
                let scale = tuningProfile.windowCalibration[p]
                if layout.isWholeParentBand(index: i, baseEdges: tuningProfile.baseEdges) {
                    acc[i] = coarse[p]
                } else {
                    acc[i] = rows[i] * weights[i] / scale * tuningProfile.subBandTrim
                }
            }
        }

        if inputGain != 1.0 {
            let g = max(0.0, inputGain)
            for i in 0..<acc.count {
                acc[i] *= g
            }
        }

        return chain.step(
            acc: acc,
            dt: dt,
            reactivity: reactivity,
            noiseGateScale: noiseGateScale,
            profile: tuningProfile
        )
    }

    /// Resets all buffers, histories, and envelope states.
    public func reset() {
        circularBuffer.clear()
        chain.reset()
    }

    /// UI layout helper: calculates recommended band count for a given display width.
    /// Follows baseline 6 bars with +1 bar per 28 pt of additional width beyond 168 pt.
    #if canImport(CoreGraphics)
    public static func recommendedBandCount(
        width: CGFloat,
        baseline: Int = 6,
        baseWidth: CGFloat = 168.0,
        step: CGFloat = 28.0
    ) -> Int {
        guard width > baseWidth, step > 0 else { return baseline }
        let extra = Int(floor((width - baseWidth) / step))
        return baseline + max(0, extra)
    }
    #else
    public static func recommendedBandCount(
        width: Double,
        baseline: Int = 6,
        baseWidth: Double = 168.0,
        step: Double = 28.0
    ) -> Int {
        guard width > baseWidth, step > 0 else { return baseline }
        let extra = Int(floor((width - baseWidth) / step))
        return baseline + max(0, extra)
    }
    #endif
}

import Foundation

/// Per-band spectrum state machine managing dynamic range, reference envelope, and attack boost.
public final class SpectrumChain: @unchecked Sendable {
    public let bandCount: Int
    public let layout: BandLayout
    public private(set) var gain: [Double]
    public private(set) var exponent: [Double]
    public private(set) var punch: [Double]

    private var history: [[Double]]
    private var slow: [Double]
    public private(set) var output: [Float]

    public init(bandCount: Int, layout: BandLayout, profile: TuningProfile) {
        self.bandCount = bandCount
        self.layout = layout
        let centres = layout.centres
        self.gain = centres.map { BandLayout.smoothCal(profile.gains, at: $0, baseEdges: profile.baseEdges) }
        self.exponent = centres.map { BandLayout.smoothCal(profile.exponents, at: $0, baseEdges: profile.baseEdges) }
        self.punch = centres.map { BandLayout.smoothCal(profile.punch, at: $0, baseEdges: profile.baseEdges) }

        let n = max(1, layout.count)
        self.history = [[Double]](repeating: [Double](repeating: 0.0, count: n), count: 3)
        self.slow = [Double](repeating: 0.0, count: n)
        self.output = [Float](repeating: 0.0, count: n)
    }

    public func updateProfile(_ profile: TuningProfile) {
        let centres = layout.centres
        self.gain = centres.map { BandLayout.smoothCal(profile.gains, at: $0, baseEdges: profile.baseEdges) }
        self.exponent = centres.map { BandLayout.smoothCal(profile.exponents, at: $0, baseEdges: profile.baseEdges) }
        self.punch = centres.map { BandLayout.smoothCal(profile.punch, at: $0, baseEdges: profile.baseEdges) }
    }

    /// Consumes one tick of band energy accumulators and advances the chain by dt seconds.
    @discardableResult
    public func step(
        acc: [Double],
        dt: Double,
        reactivity: Double,
        noiseGateScale: Double,
        profile: TuningProfile
    ) -> [Float] {
        let n = output.count
        guard n > 0 else { return [] }

        // 1. Per-band dynamic range normalization
        var value = [Double](repeating: 0.0, count: n)
        for i in 0..<n {
            let energy = (i < acc.count) ? acc[i] : 0.0
            let raw = energy * gain[i]
            value[i] = min(1.0, max(0.0, pow(max(0.0, raw), exponent[i])))
        }

        // 2. Slow envelope tracking for quiet section detection
        let stepDt = max(0.001, min(0.2, dt))
        let alpha = 1.0 - exp(-stepDt / max(1e-6, profile.slowTau))
        for i in 0..<n {
            slow[i] += (value[i] - slow[i]) * alpha
        }

        // 3. Attack boost against 3-tap reference envelope
        var smoothed = [Double](repeating: 0.0, count: n)
        for (k, weight) in profile.referenceKernel.enumerated() {
            let src = history[min(k, 2)]
            for i in 0..<n {
                smoothed[i] += weight * src[i]
            }
        }

        let low = profile.deadbandLow * max(0.0, noiseGateScale)
        let high = profile.deadbandHigh * max(0.0, noiseGateScale)

        for i in 0..<n {
            let rise = max(0.0, value[i] - smoothed[i])
            let gate = min(1.0, max(0.0, 1.0 - slow[i] / max(1e-6, profile.gateLow)))
            let amount = (punch[i] * gate + profile.punchBase) * max(0.0, reactivity)
            let shape = (high > low) ? min(1.0, max(0.0, (rise - low) / (high - low))) : 1.0
            output[i] = Float(min(1.0, max(0.0, value[i] + amount * rise * shape)))
        }

        // 4. History rotation (newest first)
        history[2] = history[1]
        history[1] = history[0]
        history[0] = value

        return output
    }

    public func reset() {
        let n = output.count
        self.history = [[Double]](repeating: [Double](repeating: 0.0, count: n), count: 3)
        self.slow = [Double](repeating: 0.0, count: n)
        self.output = [Float](repeating: 0.0, count: n)
    }
}

import Foundation

/// Deterministic synthetic audio signal generators for DSP testing and golden vector verification.
public enum SyntheticSignals {

    /// Generates a logarithmic frequency chirp sweep from f0 to f1 over duration T.
    public static func logChirp(
        sampleRate: Double = 48000.0,
        duration: Double = 1.0,
        f0: Double = 20.0,
        f1: Double = 20000.0,
        amplitude: Float = 0.8
    ) -> [Float] {
        let sampleCount = Int(round(sampleRate * duration))
        var samples = [Float](repeating: 0.0, count: sampleCount)
        let logRatio = log(f1 / f0)

        for i in 0..<sampleCount {
            let t = Double(i) / sampleRate
            let phase = 2.0 * Double.pi * f0 * (pow(f1 / f0, t / duration) - 1.0) / logRatio * duration
            samples[i] = amplitude * Float(sin(phase))
        }
        return samples
    }

    /// Generates periodic tone bursts (short pulses) to test attack boost, transients, and decay.
    public static func periodicPulses(
        sampleRate: Double = 48000.0,
        duration: Double = 1.0,
        period: Double = 0.25,
        pulseDuration: Double = 0.02,
        frequency: Double = 1000.0,
        amplitude: Float = 0.9
    ) -> [Float] {
        let sampleCount = Int(round(sampleRate * duration))
        var samples = [Float](repeating: 0.0, count: sampleCount)

        for i in 0..<sampleCount {
            let t = Double(i) / sampleRate
            let tInPeriod = t.truncatingRemainder(dividingBy: period)
            if tInPeriod < pulseDuration {
                let phase = 2.0 * Double.pi * frequency * tInPeriod
                // Hann envelope on each burst to avoid click artifacts
                let env = 0.5 - 0.5 * cos(2.0 * Double.pi * tInPeriod / pulseDuration)
                samples[i] = amplitude * Float(sin(phase) * env)
            } else {
                samples[i] = 0.0
            }
        }
        return samples
    }

    /// Generates deterministic pseudo-random pink noise with a fixed LCG seed,
    /// followed by an exponential fadeout to silence.
    public static func pinkNoiseWithFadeout(
        sampleRate: Double = 48000.0,
        duration: Double = 1.0,
        fadeoutStart: Double = 0.6,
        amplitude: Float = 0.7
    ) -> [Float] {
        let sampleCount = Int(round(sampleRate * duration))
        var samples = [Float](repeating: 0.0, count: sampleCount)

        // Deterministic Linear Congruential Generator (LCG)
        var state: UInt64 = 123456789
        func nextRandomFloat() -> Double {
            state = (state &* 6364136223846793005) &+ 1442695040888963407
            let val = Double(state >> 32) / Double(UInt32.max)
            return (val * 2.0) - 1.0 // [-1, 1]
        }

        // Paul Kellet's filter for pink noise generation
        var b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0

        for i in 0..<sampleCount {
            let t = Double(i) / sampleRate
            let white = nextRandomFloat()

            b0 = 0.99886 * b0 + white * 0.0555179
            b1 = 0.99332 * b1 + white * 0.0750759
            b2 = 0.96900 * b2 + white * 0.1538520
            b3 = 0.86650 * b3 + white * 0.3104856
            b4 = 0.55000 * b4 + white * 0.5329522
            b5 = -0.7616 * b5 - white * 0.0168980
            let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
            b6 = white * 0.115926

            // Normalization roughly to [-1, 1]
            var val = Float(pink * 0.15) * amplitude

            // Fadeout envelope
            if t > fadeoutStart {
                let fadeProgress = (t - fadeoutStart) / max(0.001, duration - fadeoutStart)
                let env = Float(max(0.0, 1.0 - fadeProgress))
                val *= (env * env)
            }

            samples[i] = min(1.0, max(-1.0, val))
        }
        return samples
    }
}

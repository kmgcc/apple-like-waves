import Foundation
import Accelerate

/// Real-valued Fast Fourier Transform analyzer using Apple Accelerate vDSP.
public final class RealFFT: @unchecked Sendable {
    public let fftSize: Int
    public let halfSize: Int
    private let log2n: vDSP_Length
    private let fftSetup: FFTSetup
    private let window: [Float]
    private let magScale: Float

    public init?(fftSize: Int = 2048) {
        guard fftSize >= 2, (fftSize & (fftSize - 1)) == 0 else { return nil }
        self.fftSize = fftSize
        self.halfSize = fftSize / 2
        let log2Val = Int(round(log2(Double(fftSize))))
        self.log2n = vDSP_Length(log2Val)

        guard let setup = vDSP_create_fftsetup(self.log2n, FFTRadix(kFFTRadix2)) else {
            return nil
        }
        self.fftSetup = setup

        // Hann window: w[n] = 0.5 - 0.5 * cos(2 * pi * n / N)
        var win = [Float](repeating: 0.0, count: fftSize)
        for i in 0..<fftSize {
            win[i] = Float(0.5 - 0.5 * cos(2.0 * Double.pi * Double(i) / Double(fftSize)))
        }
        self.window = win

        // vDSP zvabs produces 2 * |DFT|. Dividing by halfSize scales single-tone peak to 1.0.
        self.magScale = Float(1.0 / Double(self.halfSize))
    }

    deinit {
        vDSP_destroy_fftsetup(fftSetup)
    }

    /// Computes Hann-windowed magnitude spectrum for `fftSize` input samples.
    /// Returns `halfSize` (1024) magnitude bins.
    public func computeMagnitudes(samples: [Float]) -> [Float] {
        guard samples.count >= fftSize else { return [] }

        var windowed = [Float](repeating: 0.0, count: fftSize)
        var re = [Float](repeating: 0.0, count: halfSize)
        var im = [Float](repeating: 0.0, count: halfSize)
        var mags = [Float](repeating: 0.0, count: halfSize)

        samples.withUnsafeBufferPointer { src in
            vDSP_vmul(src.baseAddress!, 1, window, 1, &windowed, 1, vDSP_Length(fftSize))
            re.withUnsafeMutableBufferPointer { rp in
                im.withUnsafeMutableBufferPointer { ip in
                    var split = DSPSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
                    windowed.withUnsafeBufferPointer { wp in
                        wp.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfSize) { cp in
                            vDSP_ctoz(cp, 2, &split, 1, vDSP_Length(halfSize))
                            vDSP_fft_zrip(fftSetup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                        }
                    }
                    vDSP_zvabs(&split, 1, &mags, 1, vDSP_Length(halfSize))
                }
            }
        }

        var s = magScale
        var scaled = [Float](repeating: 0.0, count: halfSize)
        vDSP_vsmul(mags, 1, &s, &scaled, 1, vDSP_Length(halfSize))
        return scaled
    }

    /// Accumulates magnitude spectrum into bands according to layout, multiplied by K = 2 * sqrt(8/3).
    public static func bands(
        magnitudes mags: [Float],
        binWidth: Double,
        layout: BandLayout,
        cleanAssignment: Bool = false
    ) -> [Double] {
        let count = layout.count
        guard count > 0, !mags.isEmpty else { return [] }
        let kFactor = 2.0 * (8.0 / 3.0).squareRoot()
        var row = [Double](repeating: 0.0, count: count)
        var band = 0

        for k in 0..<mags.count {
            let f = Double(k) * binWidth
            let m = Double(mags[k])

            if cleanAssignment {
                if f < layout.edges[0] || f >= layout.edges[count] { continue }
                while band + 1 < count && f >= layout.edges[band + 1] { band += 1 }
                row[band] += m
                continue
            }

            let lo = layout.edges[band]
            let hi = layout.edges[band + 1]
            if f < lo || f > hi {
                if band + 1 < count && f >= hi {
                    while band + 1 < count && f >= layout.edges[band + 1] { band += 1 }
                }
                row[band] += m / (hi - lo)
            } else {
                row[band] += m
            }
        }

        for b in 0..<count {
            row[b] *= kFactor
        }
        return row
    }
}

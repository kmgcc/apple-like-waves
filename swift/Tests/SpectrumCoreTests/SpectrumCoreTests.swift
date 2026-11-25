import XCTest
@testable import SpectrumCore
@testable import SpectrumUI

final class SpectrumCoreTests: XCTestCase {

    func testDefaultTuningProfile() throws {
        let profile = TuningProfile.default
        XCTAssertEqual(profile.baseEdges.count, 7)
        XCTAssertEqual(profile.gains.count, 6)
        XCTAssertEqual(profile.exponents.count, 6)
        XCTAssertEqual(profile.punch.count, 6)
        XCTAssertEqual(profile.referenceKernel.count, 3)
        XCTAssertEqual(profile.windowCalibration.count, 6)
        XCTAssertEqual(profile.spring.duration, 0.325, accuracy: 1e-6)
        XCTAssertEqual(profile.spring.damping, 0.83, accuracy: 1e-6)

        // Verify JSON round-trip
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(profile)
        let decoded = try JSONDecoder().decode(TuningProfile.self, from: data)
        XCTAssertEqual(profile, decoded)
    }

    func testBandLayout() {
        let binWidth = 48000.0 / 2048.0
        let layout6 = BandLayout.make(count: 6, binWidth: binWidth)
        XCTAssertEqual(layout6.count, 6)
        XCTAssertEqual(layout6.edges, TuningProfile.default.baseEdges)

        let layout36 = BandLayout.make(count: 36, binWidth: binWidth)
        XCTAssertEqual(layout36.count, 36)
        XCTAssertGreaterThanOrEqual(layout36.edges.first ?? 0, 39.0)
        XCTAssertEqual(layout36.edges.last ?? 0, 10000.0, accuracy: 1e-3)

        // Every band must have positive width and density scale
        for i in 0..<36 {
            XCTAssertGreaterThan(layout36.widths[i], 0)
            XCTAssertGreaterThan(layout36.densityScale[i], 0)
        }
    }

    func testCircularBuffer() {
        var buffer = CircularBuffer(capacity: 8)
        buffer.push([1.0, 2.0, 3.0])
        let snap1 = buffer.snapshot()
        XCTAssertEqual(snap1, [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0])

        buffer.push([4.0, 5.0, 6.0, 7.0, 8.0, 9.0])
        let snap2 = buffer.snapshot()
        XCTAssertEqual(snap2, [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0])

        buffer.clear()
        let snap3 = buffer.snapshot()
        XCTAssertEqual(snap3, [Float](repeating: 0.0, count: 8))
    }

    func testRealFFTSineWavePeak() {
        guard let fft = RealFFT(fftSize: 2048) else {
            XCTFail("RealFFT init failed")
            return
        }

        let sampleRate = 48000.0
        let freq = 1171.875 // 50 * (48000 / 2048) => bin 50
        var samples = [Float](repeating: 0.0, count: 2048)
        for i in 0..<2048 {
            samples[i] = Float(sin(2.0 * Double.pi * freq * Double(i) / sampleRate))
        }

        let mags = fft.computeMagnitudes(samples: samples)
        XCTAssertEqual(mags.count, 1024)

        // Bin 50 should be the peak
        var maxBin = 0
        var maxMag: Float = 0.0
        for (i, m) in mags.enumerated() {
            if m > maxMag {
                maxMag = m
                maxBin = i
            }
        }
        XCTAssertEqual(maxBin, 50)
        XCTAssertEqual(Double(maxMag), 1.0, accuracy: 0.05)
    }

    func testSpringSolver() {
        let solver = CapsuleSpringSolver.fromDuration(0.325, dampingFraction: 0.83)
        var pos = 0.0
        var vel = 0.0
        let target = 1.0
        let omega = 2.0 * Double.pi / solver.response
        let zeta = solver.dampingFraction

        var maxPos = 0.0
        for _ in 0..<120 {
            let res = CapsuleSpringSolver.step(
                position: pos,
                velocity: vel,
                target: target,
                omega: omega,
                zeta: zeta,
                dt: 1.0 / 120.0
            )
            pos = res.position
            vel = res.velocity
            maxPos = max(maxPos, pos)
        }

        // Small overshoot (around 0.9%)
        XCTAssertGreaterThan(maxPos, 1.0)
        XCTAssertLessThan(maxPos, 1.03)
        // Converges close to 1.0 within 1 second
        XCTAssertEqual(pos, 1.0, accuracy: 0.01)
    }

    func testRecommendedBandCount() {
        XCTAssertEqual(SpectrumAnalyzer.recommendedBandCount(width: 100), 6)
        XCTAssertEqual(SpectrumAnalyzer.recommendedBandCount(width: 168), 6)
        XCTAssertEqual(SpectrumAnalyzer.recommendedBandCount(width: 195), 6)
        XCTAssertEqual(SpectrumAnalyzer.recommendedBandCount(width: 196), 7)
        XCTAssertEqual(SpectrumAnalyzer.recommendedBandCount(width: 224), 8)
        XCTAssertEqual(SpectrumAnalyzer.recommendedBandCount(width: 252), 9)
    }

    struct GoldenVectorStep: Codable {
        let stepIndex: Int
        let pcm: [Float]
        let output: [Float]
    }

    struct GoldenVectorFile: Codable {
        let name: String
        let signal: String
        let bandCount: Int
        let sampleRate: Double
        let dt: Double
        let stepCount: Int
        let steps: [GoldenVectorStep]
    }

    func testGenerateAndExportGoldenVectors() throws {
        let sampleRate = 48000.0
        let dt = 1.0 / 60.0
        let stepCount = 60
        let chunkSize = Int(round(sampleRate * dt)) // 800 samples

        let signals: [(name: String, pcm: [Float])] = [
            ("log_chirp", SyntheticSignals.logChirp(sampleRate: sampleRate, duration: 1.0)),
            ("short_pulse", SyntheticSignals.periodicPulses(sampleRate: sampleRate, duration: 1.0)),
            ("pink_noise", SyntheticSignals.pinkNoiseWithFadeout(sampleRate: sampleRate, duration: 1.0))
        ]

        let bandCounts = [6, 36]

        // Locate repository root
        let currentFile = URL(fileURLWithPath: #file)
        let repoRoot = currentFile
            .deletingLastPathComponent() // SpectrumCoreTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // swift
            .deletingLastPathComponent() // apple-like-waves

        let outputDir = repoRoot.appendingPathComponent("spec/golden-vectors")
        try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        for (sigName, pcm) in signals {
            for count in bandCounts {
                let analyzer = SpectrumAnalyzer(
                    bandCount: count,
                    sampleRate: sampleRate,
                    tuningProfile: .default
                )

                var steps: [GoldenVectorStep] = []
                steps.reserveCapacity(stepCount)

                for stepIdx in 0..<stepCount {
                    let start = stepIdx * chunkSize
                    let end = min(pcm.count, start + chunkSize)
                    let chunk = Array(pcm[start..<end])

                    analyzer.pushSamples(chunk)
                    let out = analyzer.step(dt: dt)

                    // Assert all outputs normalized in [0, 1]
                    XCTAssertEqual(out.count, count)
                    for val in out {
                        XCTAssertGreaterThanOrEqual(val, 0.0)
                        XCTAssertLessThanOrEqual(val, 1.0001)
                    }

                    steps.append(GoldenVectorStep(
                        stepIndex: stepIdx,
                        pcm: chunk,
                        output: out
                    ))
                }

                let vectorFile = GoldenVectorFile(
                    name: "\(sigName)_\(count)bands",
                    signal: sigName,
                    bandCount: count,
                    sampleRate: sampleRate,
                    dt: dt,
                    stepCount: stepCount,
                    steps: steps
                )

                let fileURL = outputDir.appendingPathComponent("\(sigName)_\(count)bands.json")
                let data = try encoder.encode(vectorFile)
                try data.write(to: fileURL)

                XCTAssertTrue(FileManager.default.fileExists(atPath: fileURL.path))
            }
        }
    }

    func testVerifyGoldenVectorsConsistency() throws {
        let currentFile = URL(fileURLWithPath: #file)
        let repoRoot = currentFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let vectorsDir = repoRoot.appendingPathComponent("spec/golden-vectors")

        let decoder = JSONDecoder()
        let files = ["log_chirp_6bands.json", "log_chirp_36bands.json", "short_pulse_6bands.json", "pink_noise_6bands.json"]

        for fileName in files {
            let fileURL = vectorsDir.appendingPathComponent(fileName)
            guard FileManager.default.fileExists(atPath: fileURL.path) else { continue }
            let data = try Data(contentsOf: fileURL)
            let file = try decoder.decode(GoldenVectorFile.self, from: data)

            let analyzer = SpectrumAnalyzer(
                bandCount: file.bandCount,
                sampleRate: file.sampleRate,
                tuningProfile: .default
            )

            for step in file.steps {
                analyzer.pushSamples(step.pcm)
                let actual = analyzer.step(dt: file.dt)
                XCTAssertEqual(actual.count, step.output.count)
                for (a, e) in zip(actual, step.output) {
                    XCTAssertEqual(a, e, accuracy: 1e-6)
                }
            }
        }
    }
}

import Foundation

/// Canonical tuning parameters for the spectrum analysis chain.
public struct TuningProfile: Codable, Sendable, Equatable {
    public var version: String
    public var baseEdges: [Double]
    public var gains: [Double]
    public var exponents: [Double]
    public var punch: [Double]
    public var referenceKernel: [Double]
    public var punchBase: Double
    public var gateLow: Double
    public var slowTau: Double
    public var deadbandLow: Double
    public var deadbandHigh: Double
    public var multiBandLowEdge: Double
    public var windowCalibration: [Double]
    public var subBandTrim: Double
    public var spring: SpringSettings

    public struct SpringSettings: Codable, Sendable, Equatable {
        public var duration: Double
        public var damping: Double
        public var widthExpansion: Double
        public var pauseDuration: Double
        public var pauseDamping: Double

        public init(
            duration: Double = 0.325,
            damping: Double = 0.83,
            widthExpansion: Double = 0.145,
            pauseDuration: Double = 0.60,
            pauseDamping: Double = 1.0
        ) {
            self.duration = duration
            self.damping = damping
            self.widthExpansion = widthExpansion
            self.pauseDuration = pauseDuration
            self.pauseDamping = pauseDamping
        }
    }

    public init(
        version: String = "1.0.0",
        baseEdges: [Double] = [20.0, 81.0, 170.0, 527.0, 1500.0, 4500.0, 10000.0],
        gains: [Double] = [0.706, 0.706, 0.433, 0.433, 0.339, 0.300],
        exponents: [Double] = [1.15, 0.85, 0.75, 0.85, 0.70, 0.75],
        punch: [Double] = [3.45, 2.07, 3.45, 11.5, 1.38, 1.38],
        referenceKernel: [Double] = [0.5, 0.3, 0.2],
        punchBase: Double = 1.05,
        gateLow: Double = 0.35,
        slowTau: Double = 0.8,
        deadbandLow: Double = 0.01,
        deadbandHigh: Double = 0.06,
        multiBandLowEdge: Double = 40.0,
        windowCalibration: [Double] = [1.828, 1.765, 1.324, 1.351, 1.369, 1.424],
        subBandTrim: Double = 0.85,
        spring: SpringSettings = SpringSettings()
    ) {
        self.version = version
        self.baseEdges = baseEdges
        self.gains = gains
        self.exponents = exponents
        self.punch = punch
        self.referenceKernel = referenceKernel
        self.punchBase = punchBase
        self.gateLow = gateLow
        self.slowTau = slowTau
        self.deadbandLow = deadbandLow
        self.deadbandHigh = deadbandHigh
        self.multiBandLowEdge = multiBandLowEdge
        self.windowCalibration = windowCalibration
        self.subBandTrim = subBandTrim
        self.spring = spring
    }

    /// The default canonical tuning profile.
    public static let `default` = TuningProfile()

    public static func load(from data: Data) throws -> TuningProfile {
        let decoder = JSONDecoder()
        return try decoder.decode(TuningProfile.self, from: data)
    }

    public static func load(from url: URL) throws -> TuningProfile {
        let data = try Data(contentsOf: url)
        return try load(from: data)
    }

    public static func load(fromJson jsonString: String) throws -> TuningProfile {
        guard let data = jsonString.data(using: .utf8) else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: [], debugDescription: "Invalid UTF-8 string")
            )
        }
        return try load(from: data)
    }
}

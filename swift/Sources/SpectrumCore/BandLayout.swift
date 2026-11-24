import Foundation

/// Defines frequency band division and bin mapping for spectrum analysis.
public struct BandLayout: Sendable, Equatable {
    public let edges: [Double]
    public let parent: [Int]
    public let binWidth: Double

    public init(edges: [Double], parent: [Int]? = nil, binWidth: Double = 0) {
        self.edges = edges
        self.parent = parent ?? Array(0..<max(0, edges.count - 1))
        self.binWidth = binWidth
    }

    public var count: Int {
        max(0, edges.count - 1)
    }

    public var centres: [Double] {
        (0..<count).map { (edges[$0] * edges[$0 + 1]).squareRoot() }
    }

    public var widths: [Double] {
        (0..<count).map { edges[$0 + 1] - edges[$0] }
    }

    public var octaves: [Double] {
        (0..<count).map { log2(edges[$0 + 1] / edges[$0]) }
    }

    /// Conversion scale factor from sub-band bin density back to parent band scale.
    public var densityScale: [Double] {
        (0..<count).map { i in
            let p = min(max(parent[i], 0), 5)
            guard binWidth > 0 else {
                let pw = BandLayout.defaultBaseEdges[p + 1] - BandLayout.defaultBaseEdges[p]
                return pw / widths[i]
            }
            let selfBins = binCount(from: edges[i], to: edges[i + 1])
            let parentBins = binCount(
                from: p == 0 ? edges[0] : BandLayout.defaultBaseEdges[p],
                to: BandLayout.defaultBaseEdges[p + 1]
            )
            return parentBins / selfBins
        }
    }

    public func binCount(from lo: Double, to hi: Double) -> Double {
        guard binWidth > 0 else { return 1.0 }
        let first = (lo / binWidth).rounded(.up)
        let last = (hi / binWidth).rounded(.up)
        return max(1.0, last - first)
    }

    public static let defaultBaseEdges: [Double] = [20.0, 81.0, 170.0, 527.0, 1500.0, 4500.0, 10000.0]

    /// Smoothstep-interpolates a 6-element calibration vector across logarithmic frequency anchor points.
    public static func smoothCal(_ v: [Double], at f: Double, baseEdges: [Double] = defaultBaseEdges) -> Double {
        guard v.count >= 6 else { return v.first ?? 0 }
        let anchors = (0..<6).map { log2((baseEdges[$0] * baseEdges[$0 + 1]).squareRoot()) }
        let x = log2(max(f, 1e-9))
        if x <= anchors[0] { return v[0] }
        if x >= anchors[5] { return v[5] }
        for i in 0..<5 where x < anchors[i + 1] {
            let t = (x - anchors[i]) / (anchors[i + 1] - anchors[i])
            let s = t * t * (3.0 - 2.0 * t)
            return v[i] + (v[i + 1] - v[i]) * s
        }
        return v[5]
    }

    /// Dynamic band layout construction for arbitrary band count n.
    /// When n <= 6, returns baseEdges verbatim.
    /// When n > 6, partitions each parent band proportionally to octave width and snaps to FFT bin boundaries.
    public static func make(
        count n: Int,
        binWidth: Double,
        baseEdges: [Double] = defaultBaseEdges,
        lowEdge: Double = 40.0
    ) -> BandLayout {
        let base = baseEdges
        guard n > 6 else {
            return BandLayout(edges: base, parent: Array(0..<max(0, base.count - 1)), binWidth: binWidth)
        }

        let lo0 = min(max(lowEdge, 20.0), base[1] * 0.9)
        let lows = (0..<6).map { $0 == 0 ? lo0 : base[$0] }

        func firstBin(_ p: Int) -> Int { Int(ceil(lows[p] / binWidth - 1e-9)) }
        func lastBin(_ p: Int) -> Int { Int(ceil(base[p + 1] / binWidth - 1e-9)) }

        let avail = (0..<6).map { max(1, lastBin($0) - firstBin($0)) }
        let oct = (0..<6).map { log2(base[$0 + 1] / lows[$0]) }
        let totalOct = oct.reduce(0.0, +)

        let ideal = oct.map { Double(n) * $0 / totalOct }
        var alloc = (0..<6).map { min(max(1, Int(ideal[$0])), avail[$0]) }
        var carry = (0..<6).map { ideal[$0] - Double(Int(ideal[$0])) }
        var delta = n - alloc.reduce(0, +)

        while delta > 0 {
            let candidates = (0..<6).filter { alloc[$0] < avail[$0] }
            guard let pick = candidates.max(by: { carry[$0] < carry[$1] }) else { break }
            alloc[pick] += 1
            carry[pick] -= 1
            delta -= 1
        }
        while delta < 0 {
            let candidates = (0..<6).filter { alloc[$0] > 1 }
            guard let pick = candidates.min(by: { carry[$0] < carry[$1] }) else { break }
            alloc[pick] -= 1
            carry[pick] += 1
            delta += 1
        }
        while delta > 0 {
            let pick = (0..<6).max { oct[$0] / Double(alloc[$0]) < oct[$1] / Double(alloc[$1]) }
            guard let pick else { break }
            alloc[pick] += 1
            delta -= 1
        }

        var edges: [Double] = []
        var parent: [Int] = []
        for p in 0..<6 {
            let lo = lows[p]
            let hi = base[p + 1]
            let b0 = firstBin(p)
            let b1 = lastBin(p)
            let m = max(1, min(alloc[p], max(1, b1 - b0)))
            var bounds: [Int] = [b0]
            for j in 1..<m {
                let hz = lo * pow(hi / lo, Double(j) / Double(m))
                var b = Int(ceil(hz / binWidth - 1e-9))
                b = max(b, (bounds.last ?? b0) + 1)
                b = min(b, b1 - (m - j))
                bounds.append(b)
            }
            bounds.append(b1)
            for j in 0..<m {
                let e: Double = (j == 0) ? lo : Double(bounds[j]) * binWidth
                edges.append(min(max(e, lo), hi))
                parent.append(p)
            }
        }
        edges.append(base[6])
        return BandLayout(edges: edges, parent: parent, binWidth: binWidth)
    }

    /// Determines whether band `index` exactly matches an entire parent band.
    public func isWholeParentBand(index: Int, baseEdges: [Double] = defaultBaseEdges) -> Bool {
        guard index < parent.count else { return false }
        let p = min(max(parent[index], 0), 5)
        return abs(edges[index] - baseEdges[p]) < 0.01 && abs(edges[index + 1] - baseEdges[p + 1]) < 0.01
    }
}

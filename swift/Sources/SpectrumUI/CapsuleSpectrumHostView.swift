import Foundation
import SpectrumCore
#if canImport(AppKit) && !targetEnvironment(macCatalyst)
import AppKit
import QuartzCore

/// CALayer-backed NSView for rendering responsive spectrum capsule bars.
@available(macOS 14.0, *)
@MainActor
public final class CapsuleSpectrumHostView: NSView {
    public let capsuleCount: Int
    public var capsuleWidth: CGFloat = 4.0 { didSet { refreshGeometry() } }
    public var capsuleSpacing: CGFloat = 3.0 { didSet { refreshGeometry() } }
    public var barColor: NSColor = .white { didSet { applyColors() } }

    public var isPaused: Bool = false {
        didSet {
            if isPaused != oldValue {
                activeSolver = isPaused ? pauseSolver : playSolver
            }
        }
    }

    private let rootLayer = CALayer()
    private var capsuleLayers: [CALayer] = []
    private var follower: CapsuleSpringFollower
    private var targets: [Double]

    private let playSolver: CapsuleSpringSolver
    private let pauseSolver: CapsuleSpringSolver
    private var activeSolver: CapsuleSpringSolver {
        didSet {
            follower.solver = activeSolver
        }
    }

    private var frameLink: CADisplayLink?
    private var lastTick: CFTimeInterval = 0
    private var metrics: CapsuleMetrics?

    public init(
        capsuleCount: Int = 6,
        tuningProfile: TuningProfile = .default
    ) {
        let count = max(1, capsuleCount)
        self.capsuleCount = count
        self.playSolver = .fromDuration(
            tuningProfile.spring.duration,
            dampingFraction: tuningProfile.spring.damping
        )
        self.pauseSolver = .fromDuration(
            tuningProfile.spring.pauseDuration,
            dampingFraction: tuningProfile.spring.pauseDamping
        )
        self.activeSolver = self.playSolver
        self.follower = CapsuleSpringFollower(count: count, solver: self.playSolver)
        self.targets = [Double](repeating: 0.0, count: count)

        super.init(frame: .zero)

        wantsLayer = true
        layer = CALayer()
        layer?.masksToBounds = false
        rootLayer.masksToBounds = false
        layer?.addSublayer(rootLayer)

        buildLayers()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        MainActor.assumeIsolated {
            frameLink?.invalidate()
            frameLink = nil
        }
    }

    /// Updates the target spectrum values.
    public func update(values: [Float]) {
        for i in 0..<min(capsuleCount, values.count) {
            targets[i] = Double(min(1.0, max(0.0, values[i])))
        }
        wakeLink()
    }

    private func buildLayers() {
        capsuleLayers.forEach { $0.removeFromSuperlayer() }
        capsuleLayers = (0..<capsuleCount).map { _ in
            let l = CALayer()
            l.anchorPoint = CGPoint(x: 0.5, y: 0.5)
            l.actions = [
                "bounds": NSNull(),
                "position": NSNull(),
                "frame": NSNull(),
                "backgroundColor": NSNull(),
                "cornerRadius": NSNull()
            ]
            rootLayer.addSublayer(l)
            return l
        }
        applyColors()
        refreshGeometry()
    }

    private func applyColors() {
        let cg = barColor.cgColor
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for l in capsuleLayers {
            l.backgroundColor = cg
        }
        CATransaction.commit()
    }

    public override func layout() {
        super.layout()
        updateBackingScale()
        refreshGeometry()
        renderHeights()
    }

    public override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        updateBackingScale()
        refreshGeometry()
        if window != nil {
            wakeLink()
        } else {
            frameLink?.invalidate()
            frameLink = nil
        }
    }

    private func updateBackingScale() {
        let dpr = window?.backingScaleFactor ?? 2.0
        rootLayer.contentsScale = dpr
        for l in capsuleLayers {
            l.contentsScale = dpr
        }
    }

    private func refreshGeometry() {
        guard bounds.width > 0, bounds.height > 0, !capsuleLayers.isEmpty else { return }
        let m = CapsuleMetrics.centered(
            bounds: bounds,
            count: capsuleCount,
            capsuleWidth: capsuleWidth,
            capsuleSpacing: capsuleSpacing
        )
        metrics = m
        rootLayer.frame = bounds

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for i in 0..<capsuleCount {
            let f = m.frame(for: i, normalizedHeight: 0)
            let layer = capsuleLayers[i]
            layer.position = CGPoint(x: f.midX, y: f.midY)
            layer.bounds = CGRect(x: 0, y: 0, width: f.width, height: f.height)
            layer.cornerRadius = f.width * 0.5
        }
        CATransaction.commit()
    }

    private func renderHeights() {
        guard let m = metrics, !capsuleLayers.isEmpty else { return }
        let positions = follower.positions

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for i in 0..<capsuleCount {
            let f = m.frame(for: i, normalizedHeight: CGFloat(positions[i]))
            let layer = capsuleLayers[i]
            layer.bounds = CGRect(x: 0, y: 0, width: f.width, height: f.height)
            layer.cornerRadius = f.width * 0.5
        }
        CATransaction.commit()
    }

    private func wakeLink() {
        if frameLink == nil, window != nil {
            let link = displayLink(target: self, selector: #selector(handleFrame(_:)))
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
            link.add(to: .current, forMode: .common)
            frameLink = link
        }
        frameLink?.isPaused = false
    }

    @objc private func handleFrame(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = (lastTick > 0) ? (now - lastTick) : (1.0 / 60.0)
        lastTick = now

        let effectiveTargets = isPaused ? [Double](repeating: 0.0, count: capsuleCount) : targets
        follower.step(targets: effectiveTargets, dt: dt)
        renderHeights()

        if follower.isSettled(targets: effectiveTargets) {
            frameLink?.isPaused = true
            lastTick = 0
        }
    }
}

/// Backward compatibility and standard naming alias for CapsuleSpectrumHostView.
public typealias AlwaveSpectrumHostView = CapsuleSpectrumHostView
#endif

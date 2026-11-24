import SwiftUI
import SpectrumCore

/// SwiftUI view that renders spectrum capsules with second-order spring dynamics and smooth pause collapse.
public struct CapsuleSpectrumView: View {
    public let values: [Float]
    public let isPaused: Bool
    public let capsuleWidth: CGFloat
    public let capsuleSpacing: CGFloat
    public let barColor: Color
    public let tuningProfile: TuningProfile

    @State private var follower: CapsuleSpringFollower?
    @State private var lastDate: Date = Date()

    public init(
        values: [Float],
        isPaused: Bool = false,
        capsuleWidth: CGFloat = 4.0,
        capsuleSpacing: CGFloat = 3.0,
        barColor: Color = .primary,
        tuningProfile: TuningProfile = .default
    ) {
        self.values = values
        self.isPaused = isPaused
        self.capsuleWidth = capsuleWidth
        self.capsuleSpacing = capsuleSpacing
        self.barColor = barColor
        self.tuningProfile = tuningProfile
    }

    public var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let count = max(1, values.count)
                let activeFollower: CapsuleSpringFollower
                if let existing = follower, existing.count == count {
                    activeFollower = existing
                } else {
                    let solver = CapsuleSpringSolver.fromDuration(
                        tuningProfile.spring.duration,
                        dampingFraction: tuningProfile.spring.damping
                    )
                    let newFollower = CapsuleSpringFollower(count: count, solver: solver)
                    activeFollower = newFollower
                    DispatchQueue.main.async {
                        self.follower = newFollower
                    }
                }

                let now = timeline.date
                let dt = min(0.1, max(0.001, now.timeIntervalSince(lastDate)))
                DispatchQueue.main.async {
                    self.lastDate = now
                }

                if isPaused {
                    activeFollower.solver = .fromDuration(
                        tuningProfile.spring.pauseDuration,
                        dampingFraction: tuningProfile.spring.pauseDamping
                    )
                } else {
                    activeFollower.solver = .fromDuration(
                        tuningProfile.spring.duration,
                        dampingFraction: tuningProfile.spring.damping
                    )
                }

                let targets = isPaused
                    ? [Double](repeating: 0.0, count: count)
                    : (0..<count).map { Double(min(1.0, max(0.0, ($0 < values.count) ? values[$0] : 0.0))) }

                let positions = activeFollower.step(targets: targets, dt: dt)

                let metrics = CapsuleMetrics.centered(
                    bounds: CGRect(origin: .zero, size: size),
                    count: count,
                    capsuleWidth: capsuleWidth,
                    capsuleSpacing: capsuleSpacing,
                    widthExpansion: CGFloat(tuningProfile.spring.widthExpansion)
                )

                for i in 0..<count {
                    let rect = metrics.frame(for: i, normalizedHeight: CGFloat(positions[i]))
                    let path = Path(roundedRect: rect, cornerRadius: rect.width * 0.5)
                    context.fill(path, with: .color(barColor))
                }
            }
        }
    }
}

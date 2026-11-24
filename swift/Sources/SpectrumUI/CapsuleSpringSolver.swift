import Foundation

/// Second-order damped harmonic oscillator physics solver.
public struct CapsuleSpringSolver: Sendable {
    public var response: Double
    public var dampingFraction: Double

    public init(response: Double = 0.2282, dampingFraction: Double = 0.83) {
        self.response = max(0.001, response)
        self.dampingFraction = max(0.0, dampingFraction)
    }

    /// Convenience initializer using duration and damping fraction.
    /// Uses duration-to-omega mapping (omega = 8.95 / duration).
    public static func fromDuration(_ duration: Double = 0.325, dampingFraction: Double = 0.83) -> CapsuleSpringSolver {
        let omega = 8.95 / max(0.01, duration)
        let response = (2.0 * Double.pi) / omega
        return CapsuleSpringSolver(response: response, dampingFraction: dampingFraction)
    }

    /// Exact closed-form solution of d'' + 2ζω·d' + ω²·d = 0 over time step dt.
    public static func step(
        position: Double,
        velocity: Double,
        target: Double,
        omega: Double,
        zeta: Double,
        dt: Double
    ) -> (position: Double, velocity: Double) {
        guard omega > 0.0, dt > 0.0 else { return (position, velocity) }
        let d0 = position - target
        let v0 = velocity
        let edge: Double = 0.0001

        if zeta < 1.0 - edge {
            // Underdamped regime (organic bounce & overshoot)
            let omegaD = omega * sqrt(max(0.0, 1.0 - zeta * zeta))
            let e = exp(-zeta * omega * dt)
            let cosw = cos(omegaD * dt)
            let sinw = sin(omegaD * dt)
            let a = d0
            let b = (v0 + zeta * omega * d0) / max(1e-12, omegaD)
            let d = e * (a * cosw + b * sinw)
            let v = e * (-zeta * omega * (a * cosw + b * sinw) + omegaD * (-a * sinw + b * cosw))
            return (target + d, v)
        } else if zeta <= 1.0 + edge {
            // Critically damped regime
            let e = exp(-omega * dt)
            let a = d0
            let b = v0 + omega * d0
            let d = (a + b * dt) * e
            let v = (b - omega * (a + b * dt)) * e
            return (target + d, v)
        } else {
            // Overdamped regime (two distinct real roots)
            let s = sqrt(max(0.0, zeta * zeta - 1.0))
            let r1 = -omega * (zeta - s)
            let r2 = -omega * (zeta + s)
            let denom = r2 - r1
            let c2 = (abs(denom) > 1e-12) ? (v0 - r1 * d0) / denom : 0.0
            let c1 = d0 - c2
            let e1 = exp(r1 * dt)
            let e2 = exp(r2 * dt)
            let d = c1 * e1 + c2 * e2
            let v = c1 * r1 * e1 + c2 * r2 * e2
            return (target + d, v)
        }
    }
}

/// Multi-bar stateful spring dynamics follower.
public final class CapsuleSpringFollower: @unchecked Sendable {
    public let count: Int
    public var solver: CapsuleSpringSolver
    public private(set) var positions: [Double]
    public private(set) var velocities: [Double]

    public init(count: Int = 6, solver: CapsuleSpringSolver = .fromDuration(0.325, dampingFraction: 0.83)) {
        self.count = max(1, count)
        self.solver = solver
        self.positions = [Double](repeating: 0.0, count: self.count)
        self.velocities = [Double](repeating: 0.0, count: self.count)
    }

    /// Advances the followers toward targets over duration dt.
    /// Sub-steps at 120 Hz (dt <= 1/120s) for numerical precision.
    @discardableResult
    public func step(targets: [Double], dt: Double) -> [Double] {
        guard dt > 0.0 else { return positions }
        let omega = (2.0 * Double.pi) / max(0.001, solver.response)
        let zeta = solver.dampingFraction
        let maxStep: Double = 1.0 / 120.0
        var remaining = dt

        while remaining > 0.0 {
            let stepDt = min(remaining, maxStep)
            for i in 0..<min(count, targets.count) {
                let (newPos, newVel) = CapsuleSpringSolver.step(
                    position: positions[i],
                    velocity: velocities[i],
                    target: targets[i],
                    omega: omega,
                    zeta: zeta,
                    dt: stepDt
                )
                positions[i] = newPos
                velocities[i] = newVel
            }
            remaining -= stepDt
        }

        return positions
    }

    /// Checks if all followers have settled within the given thresholds.
    public func isSettled(
        targets: [Double],
        positionEpsilon: Double = 0.0008,
        velocityEpsilon: Double = 0.0016
    ) -> Bool {
        for i in 0..<min(count, targets.count) {
            if abs(targets[i] - positions[i]) > positionEpsilon { return false }
            if abs(velocities[i]) > velocityEpsilon { return false }
        }
        return true
    }

    public func reset(to initialValue: Double = 0.0) {
        self.positions = [Double](repeating: initialValue, count: count)
        self.velocities = [Double](repeating: 0.0, count: count)
    }
}

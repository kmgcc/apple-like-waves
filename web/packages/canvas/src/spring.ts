/**
 * Second-order damped harmonic oscillator physics solver.
 */
export class CapsuleSpringSolver {
  public response: number;
  public dampingFraction: number;

  constructor(response = 0.2282, dampingFraction = 0.83) {
    this.response = Math.max(0.001, response);
    this.dampingFraction = Math.max(0.0, dampingFraction);
  }

  /**
   * Convenience factory using duration and damping fraction.
   * Uses duration-to-omega mapping (omega = 8.95 / duration).
   */
  public static fromDuration(
    duration = 0.325,
    dampingFraction = 0.83
  ): CapsuleSpringSolver {
    const omega = 8.95 / Math.max(0.01, duration);
    const response = (2.0 * Math.PI) / omega;
    return new CapsuleSpringSolver(response, dampingFraction);
  }

  /**
   * Exact closed-form solution of d'' + 2ζω·d' + ω²·d = 0 over time step dt.
   */
  public static step(
    position: number,
    velocity: number,
    target: number,
    omega: number,
    zeta: number,
    dt: number
  ): { position: number; velocity: number } {
    if (omega <= 0.0 || dt <= 0.0) {
      return { position, velocity };
    }

    const d0 = position - target;
    const v0 = velocity;
    const edge = 0.0001;

    if (zeta < 1.0 - edge) {
      // Underdamped regime (organic bounce & overshoot)
      const omegaD = omega * Math.sqrt(Math.max(0.0, 1.0 - zeta * zeta));
      const e = Math.exp(-zeta * omega * dt);
      const cosw = Math.cos(omegaD * dt);
      const sinw = Math.sin(omegaD * dt);
      const a = d0;
      const b = (v0 + zeta * omega * d0) / Math.max(1e-12, omegaD);
      const d = e * (a * cosw + b * sinw);
      const v =
        e *
        (-zeta * omega * (a * cosw + b * sinw) +
          omegaD * (-a * sinw + b * cosw));
      return { position: target + d, velocity: v };
    } else if (zeta <= 1.0 + edge) {
      // Critically damped regime
      const e = Math.exp(-omega * dt);
      const a = d0;
      const b = v0 + omega * d0;
      const d = (a + b * dt) * e;
      const v = (b - omega * (a + b * dt)) * e;
      return { position: target + d, velocity: v };
    } else {
      // Overdamped regime (two distinct real roots)
      const s = Math.sqrt(Math.max(0.0, zeta * zeta - 1.0));
      const r1 = -omega * (zeta - s);
      const r2 = -omega * (zeta + s);
      const denom = r2 - r1;
      const c2 = Math.abs(denom) > 1e-12 ? (v0 - r1 * d0) / denom : 0.0;
      const c1 = d0 - c2;
      const e1 = Math.exp(r1 * dt);
      const e2 = Math.exp(r2 * dt);
      const d = c1 * e1 + c2 * e2;
      const v = c1 * r1 * e1 + c2 * r2 * e2;
      return { position: target + d, velocity: v };
    }
  }
}

/**
 * Multi-bar stateful spring dynamics follower with dt clamping (dt <= 1/30).
 */
export class CapsuleSpringFollower {
  public count: number;
  public solver: CapsuleSpringSolver;
  public positions: number[];
  public velocities: number[];

  constructor(
    count = 6,
    solver: CapsuleSpringSolver = CapsuleSpringSolver.fromDuration(0.325, 0.83)
  ) {
    this.count = Math.max(1, count);
    this.solver = solver;
    this.positions = new Array(this.count).fill(0.0);
    this.velocities = new Array(this.count).fill(0.0);
  }

  public setCount(newCount: number): void {
    const count = Math.max(1, newCount);
    if (count === this.count) return;

    const newPositions = new Array(count).fill(0.0);
    const newVelocities = new Array(count).fill(0.0);

    const copyLen = Math.min(count, this.count);
    for (let i = 0; i < copyLen; i++) {
      newPositions[i] = this.positions[i];
      newVelocities[i] = this.velocities[i];
    }

    this.count = count;
    this.positions = newPositions;
    this.velocities = newVelocities;
  }

  /**
   * Advances the followers toward targets over duration dt.
   * Clamps dt <= 1/30s and sub-steps at 120 Hz (dt <= 1/120s) for numerical precision.
   */
  public step(targets: readonly number[], rawDt: number): number[] {
    // Clamp frame dt <= 1/30s to prevent huge jumps on tab switch / lag spikes
    const dt = Math.max(0.0, Math.min(rawDt, 1.0 / 30.0));
    if (dt <= 0.0) return this.positions;

    const omega = (2.0 * Math.PI) / Math.max(0.001, this.solver.response);
    const zeta = this.solver.dampingFraction;
    const maxStep = 1.0 / 120.0;
    let remaining = dt;

    while (remaining > 0.0) {
      const stepDt = Math.min(remaining, maxStep);
      const limit = Math.min(this.count, targets.length);
      for (let i = 0; i < limit; i++) {
        const { position, velocity } = CapsuleSpringSolver.step(
          this.positions[i],
          this.velocities[i],
          targets[i],
          omega,
          zeta,
          stepDt
        );
        this.positions[i] = position;
        this.velocities[i] = velocity;
      }
      remaining -= stepDt;
    }

    return this.positions;
  }

  /**
   * Checks if all followers have settled within the given thresholds.
   */
  public isSettled(
    targets: readonly number[],
    positionEpsilon = 0.0008,
    velocityEpsilon = 0.0016
  ): boolean {
    const limit = Math.min(this.count, targets.length);
    for (let i = 0; i < limit; i++) {
      if (Math.abs(targets[i] - this.positions[i]) > positionEpsilon) return false;
      if (Math.abs(this.velocities[i]) > velocityEpsilon) return false;
    }
    return true;
  }

  public reset(to = 0.0): void {
    this.positions.fill(to);
    this.velocities.fill(0.0);
  }
}

import { describe, it, expect } from "vitest";
import {
  CapsuleSpringSolver,
  CapsuleSpringFollower,
  CapsuleMetrics,
} from "@capsule-wave/canvas";

describe("CapsuleSpringSolver", () => {
  it("simulates underdamped step with slight overshoot", () => {
    const solver = CapsuleSpringSolver.fromDuration(0.325, 0.83);
    const omega = (2.0 * Math.PI) / solver.response;
    const zeta = solver.dampingFraction;

    let pos = 0.0;
    let vel = 0.0;
    const target = 1.0;
    let maxPos = 0.0;

    for (let i = 0; i < 120; i++) {
      const res = CapsuleSpringSolver.step(pos, vel, target, omega, zeta, 1.0 / 60.0);
      pos = res.position;
      vel = res.velocity;
      if (pos > maxPos) {
        maxPos = pos;
      }
    }

    // Settled close to 1.0
    expect(pos).toBeCloseTo(1.0, 3);
    // Slight overshoot (~0.9% overshoot, max around 1.009)
    expect(maxPos).toBeGreaterThan(1.0);
    expect(maxPos).toBeLessThan(1.03);
  });

  it("handles critically damped and overdamped cases without divergence", () => {
    // Critically damped
    const critRes = CapsuleSpringSolver.step(0.0, 0.0, 1.0, 20.0, 1.0, 0.1);
    expect(critRes.position).toBeGreaterThan(0.0);
    expect(critRes.position).toBeLessThan(1.0);

    // Overdamped
    const overRes = CapsuleSpringSolver.step(0.0, 0.0, 1.0, 20.0, 1.5, 0.1);
    expect(overRes.position).toBeGreaterThan(0.0);
    expect(overRes.position).toBeLessThan(1.0);
  });
});

describe("CapsuleSpringFollower", () => {
  it("clamps dt and settles to target", () => {
    const follower = new CapsuleSpringFollower(6);
    // Large dt (e.g. 1.0s) should be clamped to 1/30s
    follower.step([1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 1.0);
    expect(follower.positions[0]).toBeGreaterThan(0.0);
    expect(follower.positions[0]).toBeLessThan(0.8);

    // After many normal steps, it should settle
    for (let i = 0; i < 60; i++) {
      follower.step([1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 1.0 / 60.0);
    }
    expect(follower.isSettled([1.0, 1.0, 1.0, 1.0, 1.0, 1.0])).toBe(true);
  });
});

describe("CapsuleMetrics", () => {
  it("calculates centered frames correctly", () => {
    const metrics = CapsuleMetrics.centered(300, 100, 6, 4.0, 3.0);
    expect(metrics.barWidth).toBe(4.0);
    expect(metrics.spacing).toBe(3.0);
    expect(metrics.centerY).toBe(50.0);

    const f0 = metrics.frame(0, 0.0);
    expect(f0.height).toBe(metrics.minHeight);
    expect(f0.width).toBe(metrics.barWidth);

    const fMax = metrics.frame(0, 1.0);
    expect(fMax.height).toBeCloseTo(90.0, 4);
    expect(fMax.width).toBeCloseTo(4.0 * (1.0 + 0.145), 4);
  });
});

import { CapsuleMetrics } from "./geometry.js";
import { CapsuleSpringFollower, CapsuleSpringSolver } from "./spring.js";

export interface CanvasRendererOptions {
  bandCount?: number;
  color?: string | ((index: number, count: number) => string);
  capsuleWidth?: number;
  capsuleSpacing?: number;
  widthExpansion?: number;
  maxHeightRatio?: number;
  springDuration?: number;
  springDamping?: number;
  pauseDuration?: number;
  pauseDamping?: number;
  dpr?: number;
}

/**
 * 2D Canvas capsule spectrum visualizer with subpixel float rendering,
 * devicePixelRatio scaling, and smooth collapse on pause.
 */
export class CapsuleWaveCanvasRenderer {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  public bandCount: number;
  public color: string | ((index: number, count: number) => string);
  public capsuleWidth: number;
  public capsuleSpacing: number;
  public widthExpansion: number;
  public maxHeightRatio: number;
  public dpr: number;

  private isPlaying = true;
  private readonly playSolver: CapsuleSpringSolver;
  private readonly pauseSolver: CapsuleSpringSolver;
  private readonly follower: CapsuleSpringFollower;

  private cssWidth = 0;
  private cssHeight = 0;

  constructor(canvas: HTMLCanvasElement, options: CanvasRendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to acquire 2D rendering context from canvas");
    }
    this.ctx = ctx;

    this.bandCount = Math.max(1, options.bandCount ?? 6);
    this.color = options.color ?? "#ffffff";
    this.capsuleWidth = options.capsuleWidth ?? 4.0;
    this.capsuleSpacing = options.capsuleSpacing ?? 3.0;
    this.widthExpansion = options.widthExpansion ?? 0.145;
    this.maxHeightRatio = options.maxHeightRatio ?? 0.9;
    this.dpr = options.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    this.playSolver = CapsuleSpringSolver.fromDuration(
      options.springDuration ?? 0.325,
      options.springDamping ?? 0.83
    );
    this.pauseSolver = CapsuleSpringSolver.fromDuration(
      options.pauseDuration ?? 0.6,
      options.pauseDamping ?? 1.0
    );

    this.follower = new CapsuleSpringFollower(this.bandCount, this.playSolver);

    this.resize();
  }

  public setPlaying(playing: boolean): void {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
      this.follower.solver = playing ? this.playSolver : this.pauseSolver;
    }
  }

  public setBandCount(count: number): void {
    const n = Math.max(1, count);
    if (n !== this.bandCount) {
      this.bandCount = n;
      this.follower.setCount(n);
    }
  }

  /**
   * Resizes canvas buffer dimensions to match display client size * dpr.
   */
  public resize(width?: number, height?: number): void {
    const w = width ?? (this.canvas.clientWidth || 300);
    const h = height ?? (this.canvas.clientHeight || 150);

    this.cssWidth = w;
    this.cssHeight = h;

    const physicalWidth = Math.round(w * this.dpr);
    const physicalHeight = Math.round(h * this.dpr);

    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
    }
  }

  /**
   * Advances spring physics by dt and renders capsules to the canvas.
   */
  public render(energyTargets: readonly number[], dt: number, isPlaying?: boolean): void {
    if (isPlaying !== undefined) {
      this.setPlaying(isPlaying);
    }

    // When paused, collapse targets down to zero (dots) smoothly
    const targets = this.isPlaying
      ? energyTargets
      : new Array(this.bandCount).fill(0.0);

    const positions = this.follower.step(targets, dt);

    const ctx = this.ctx;
    const dpr = this.dpr;
    const width = this.cssWidth || (this.canvas.clientWidth || 300);
    const height = this.cssHeight || (this.canvas.clientHeight || 150);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const metrics = CapsuleMetrics.centered(
      width,
      height,
      this.bandCount,
      this.capsuleWidth,
      this.capsuleSpacing,
      this.maxHeightRatio,
      this.widthExpansion
    );

    for (let i = 0; i < this.bandCount; i++) {
      const normH = i < positions.length ? positions[i] : 0.0;
      const rect = metrics.frame(i, normH);

      const color =
        typeof this.color === "function" ? this.color(i, this.bandCount) : this.color;
      ctx.fillStyle = color;

      this.drawCapsule(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius);
    }

    ctx.restore();
  }

  private drawCapsule(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const ctx = this.ctx;
    const r = Math.min(radius, width * 0.5, height * 0.5);

    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
    } else {
      // Fallback for environments without ctx.roundRect
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.arcTo(x + width, y, x + width, y + r, r);
      ctx.lineTo(x + width, y + height - r);
      ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
      ctx.lineTo(x + r, y + height);
      ctx.arcTo(x, y + height, x, y + height - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
    ctx.fill();
  }

  public reset(): void {
    this.follower.reset();
  }
}

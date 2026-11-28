import { CapsuleMetrics } from "./geometry.js";
import { CapsuleSpringFollower, CapsuleSpringSolver } from "./spring.js";

export interface CanvasRendererOptions {
  bandCount?: number;
  color?: string | ((index: number, count: number) => string);
  artwork?: CanvasImageSource | null;
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
export class AlwaveCanvasRenderer {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  public bandCount: number;
  public color: string | ((index: number, count: number) => string);
  public capsuleWidth: number;
  public capsuleSpacing: number;
  public widthExpansion: number;
  public maxHeightRatio: number;
  public dpr: number;
  public artworkCanvas: HTMLCanvasElement | null = null;

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

    if (options.artwork) {
      this.setArtwork(options.artwork);
    }

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
   * Dynamically updates spring settle duration and damping ratio for active playback.
   */
  public setSpringParameters(duration: number, dampingFraction: number): void {
    const omega = 8.95 / Math.max(0.01, duration);
    this.playSolver.response = (2.0 * Math.PI) / omega;
    this.playSolver.dampingFraction = Math.max(0.0, dampingFraction);
    if (this.isPlaying) {
      this.follower.solver = this.playSolver;
    }
  }

  /**
   * Dynamically updates pause collapse settle duration and damping ratio.
   */
  public setPauseParameters(duration: number, dampingFraction: number): void {
    const omega = 8.95 / Math.max(0.01, duration);
    this.pauseSolver.response = (2.0 * Math.PI) / omega;
    this.pauseSolver.dampingFraction = Math.max(0.0, dampingFraction);
    if (!this.isPlaying) {
      this.follower.solver = this.pauseSolver;
    }
  }

  public setColor(color: string | ((index: number, count: number) => string)): void {
    this.color = color;
  }

  /**
   * Sets blurred square cover artwork to be clipped into the capsule bars.
   * Passing `null` removes the artwork and restores solid `this.color` rendering.
   */
  public setArtwork(
    source: CanvasImageSource | null,
    options?: { blurRadius?: number }
  ): void {
    if (!source) {
      this.artworkCanvas = null;
      return;
    }

    if (typeof document === "undefined") {
      this.artworkCanvas = null;
      return;
    }

    const size = 96;
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) {
      this.artworkCanvas = null;
      return;
    }

    let sw = 0;
    let sh = 0;
    const srcAny = source as any;
    if (typeof srcAny.naturalWidth === "number" && srcAny.naturalWidth > 0) {
      sw = srcAny.naturalWidth;
      sh = srcAny.naturalHeight;
    } else if (typeof srcAny.videoWidth === "number" && srcAny.videoWidth > 0) {
      sw = srcAny.videoWidth;
      sh = srcAny.videoHeight;
    } else if (typeof srcAny.width === "number" && srcAny.width > 0) {
      sw = srcAny.width;
      sh = srcAny.height;
    }
    if (sw <= 0 || sh <= 0) {
      sw = size;
      sh = size;
    }

    const minDim = Math.min(sw, sh);
    const sx = (sw - minDim) * 0.5;
    const sy = (sh - minDim) * 0.5;

    try {
      offCtx.drawImage(source, sx, sy, minDim, minDim, 0, 0, size, size);
      const imgData = offCtx.getImageData(0, 0, size, size);
      const blurRadius = options?.blurRadius ?? 12;
      applyBoxBlur(imgData, blurRadius);
      offCtx.putImageData(imgData, 0, 0);
      this.artworkCanvas = offscreen;
    } catch {
      // In case getImageData fails (e.g. cross-origin restrictions or mocked canvas)
      this.artworkCanvas = offscreen;
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

    if (this.artworkCanvas) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < this.bandCount; i++) {
        const normH = i < positions.length ? positions[i] : 0.0;
        const rect = metrics.frame(i, normH);
        this.appendCapsulePath(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius);
      }
      ctx.clip();

      const clusterW =
        this.bandCount * this.capsuleWidth +
        Math.max(0, this.bandCount - 1) * this.capsuleSpacing;
      const squareSize = Math.max(clusterW, metrics.maxBarHeight) * 1.1;
      ctx.drawImage(
        this.artworkCanvas,
        (width - squareSize) * 0.5,
        (height - squareSize) * 0.5,
        squareSize,
        squareSize
      );
      ctx.restore();
    } else {
      for (let i = 0; i < this.bandCount; i++) {
        const normH = i < positions.length ? positions[i] : 0.0;
        const rect = metrics.frame(i, normH);

        const color =
          typeof this.color === "function" ? this.color(i, this.bandCount) : this.color;
        ctx.fillStyle = color;

        this.drawCapsule(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius);
      }
    }

    ctx.restore();
  }

  private appendCapsulePath(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const ctx = this.ctx;
    const r = Math.min(radius, width * 0.5, height * 0.5);

    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
    } else {
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
  }

  private drawCapsule(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    this.appendCapsulePath(x, y, width, height, radius);
    ctx.fill();
  }

  public reset(): void {
    this.follower.reset();
  }
}

/**
 * 3-pass separable box blur on ImageData with safety floor for dark covers.
 */
function applyBoxBlur(imageData: ImageData, radius: number): void {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const r = Math.max(1, Math.floor(radius));
  const tmp = new Uint8ClampedArray(data.length);

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal pass: data -> tmp
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, cnt = 0;
        const xMin = Math.max(0, x - r);
        const xMax = Math.min(w - 1, x + r);
        for (let k = xMin; k <= xMax; k++) {
          const idx = (row + k) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          aSum += data[idx + 3];
          cnt++;
        }
        const outIdx = (row + x) * 4;
        tmp[outIdx] = (rSum / cnt) | 0;
        tmp[outIdx + 1] = (gSum / cnt) | 0;
        tmp[outIdx + 2] = (bSum / cnt) | 0;
        tmp[outIdx + 3] = (aSum / cnt) | 0;
      }
    }

    // Vertical pass: tmp -> data
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, cnt = 0;
        const yMin = Math.max(0, y - r);
        const yMax = Math.min(h - 1, y + r);
        for (let k = yMin; k <= yMax; k++) {
          const idx = (k * w + x) * 4;
          rSum += tmp[idx];
          gSum += tmp[idx + 1];
          bSum += tmp[idx + 2];
          aSum += tmp[idx + 3];
          cnt++;
        }
        const outIdx = (y * w + x) * 4;
        data[outIdx] = (rSum / cnt) | 0;
        data[outIdx + 1] = (gSum / cnt) | 0;
        data[outIdx + 2] = (bSum / cnt) | 0;
        data[outIdx + 3] = (aSum / cnt) | 0;
      }
    }
  }

  // Safety floor so completely pitch-black covers still have a visible subtle silhouette
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(20, data[i]));
    data[i + 1] = Math.min(255, Math.max(20, data[i + 1]));
    data[i + 2] = Math.min(255, Math.max(20, data[i + 2]));
  }
}

